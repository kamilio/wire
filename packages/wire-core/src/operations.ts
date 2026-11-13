import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { FileRegistry, SqliteRegistry } from "./storage/registry.js";
import { DocumentHistory, withHistoryLock, working, type HistoryDiff, type HistoryEntry, type HistoryStatus } from "./storage/history.js";
import { editorFile, editorView, plainMarkdown } from "./storage/editor-receipts.js";
import { assertWireOwner } from "./core/owner.js";
import { stableJsonCompact } from "./core/json.js";
import { extractRelationships, markdownFilename } from "./core/transform.js";
import type { FetchedDocument, JsonObject, JsonValue, Registry, Resource, ResourceData, ServiceCatalog, Source } from "./core/model.js";
import { resourceId } from "./core/resource.js";
import { fetchSource, parseSourceUrl, synchronizeSource, uploadSource, WireMergeConflict } from "./core/source.js";
import type { InitializedWire, SwitchedWireBackend, WatchCapability, WatchHandle, WireBackend, WireConfig, WireWatchConfig, WireWorkspace } from "./ports.js";

export type { WireWorkspace } from "./ports.js";

export type WireFilesystem = Readonly<{
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  createText?(path: string, contents: string): Promise<boolean>;
  writeBytes?(path: string, contents: Uint8Array): Promise<void>;
}>;

export type WireDependencies<FetchInput> = Readonly<{
  home: string;
  fetchInput: FetchInput;
  catalog: ServiceCatalog<FetchInput>;
  filesystem: WireFilesystem;
  workspace: WireWorkspace;
  initialization: Readonly<{ backend: WireBackend; registryPath: string }>;
  watch?: WatchCapability;
  now(): Date;
  open(path: string): Promise<void>;
}>;

export type WireAction = "attached" | "downloaded" | "uploaded" | "synced" | "detached" | "failed";

export type WireResult = Readonly<{
  resource: Resource;
  path: string;
  markdown: string;
  summary: Readonly<{
    action: WireAction;
    added: number;
    removed: number;
    modified: number;
    remote: string;
    local: string;
    error?: string;
  }>;
}>;

export type WireWatchSession = Readonly<{
  resource: Resource;
  path: string;
  mode: WireWatchConfig["mode"];
  debounceMs: number;
  pollMs: number;
  closed: Promise<void>;
  close(): void;
}>;

export type WireWatchSyncCommand = "sync" | "download";
export type WireWatchSyncHook = (command: WireWatchSyncCommand, result: WireResult) => Promise<WireResult>;
export const wireWatchHooks = Symbol("wireWatchHooks");

export type Wire = Readonly<{
  attach(url: string, path: string, editorReceipts?: boolean): Promise<WireResult>;
  adopt(url: string, existingFilePath: string, editorReceipts?: boolean): Promise<WireResult>;
  historyStatus(value: string, path: string): Promise<HistoryStatus>;
  historyLog(value: string, path: string): Promise<readonly HistoryEntry[]>;
  historyDiff(value: string, path: string, from?: string, to?: string): Promise<HistoryDiff>;
  resolveConflict(value: string, path: string, choice: "local" | "remote" | "working"): Promise<HistoryStatus>;
  checkpoint(value: string, path: string, expected: string, markdown: string, token: string): Promise<HistoryStatus>;
  create(url: string, path: string): Promise<WireResult>;
  view(url: string): Promise<FetchedDocument>;
  downloadSource(url: string, path: string): Promise<WireResult>;
  sync(value: string, path: string): Promise<WireResult>;
  download(value: string, path: string): Promise<WireResult>;
  detach(value: string, path: string): Promise<WireResult>;
  unlink(value: string, path: string): Promise<WireResult>;
  watch(value: string, path: string): Promise<WireWatchSession>;
  openResource(value: string, path: string): Promise<Resource>;
  syncAll(path: string): Promise<readonly WireResult[]>;
  listResources(path: string): Promise<readonly Resource[]>;
  showResource(value: string, path: string): Promise<Resource>;
  init(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire>;
  switchBackend(path: string): Promise<SwitchedWireBackend>;
}>;

type WireInternal = Wire & Readonly<{
  [wireWatchHooks](value: string, path: string, hooks: readonly WireWatchSyncHook[]): Promise<WireWatchSession>;
}>;

async function wireRoot<FetchInput>(dependencies: WireDependencies<FetchInput>, path: string): Promise<string> {
  const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
  if (configured !== null) return configured;
  return (await dependencies.workspace.initialize(dependencies.home, dependencies.initialization.backend, dependencies.initialization.registryPath)).root;
}

function watchConfig(config: WireConfig): WireWatchConfig {
  return {
    mode: config.watch?.mode ?? "two-way",
    debounceMs: config.watch?.debounceMs ?? 1000,
    pollMs: config.watch?.pollMs ?? 60000,
  };
}

function primaryLink(resource: Resource) {
  return resource.filesystem_links.find((link) => link.role === "primary")!;
}

function collisionFilename(title: string, service: string, identifier: string): string {
  const base = markdownFilename(title).slice(0, -3);
  const suffix = `${service}-${identifier}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const compact = suffix.length <= 48 ? suffix : `${suffix.slice(0, 32).replace(/[-_.]+$/g, "")}-${createHash("sha256").update(suffix).digest("hex").slice(0, 10)}`;
  return `${base}-${compact}.md`;
}

async function availableMarkdownPath(directory: string, title: string, service: string, identifier: string, occupied: (path: string) => Promise<boolean>): Promise<string> {
  const cleanPath = join(resolve(directory), markdownFilename(title));
  if (!await occupied(cleanPath)) return cleanPath;
  const fallback = join(resolve(directory), collisionFilename(title, service, identifier));
  let candidate = fallback;
  let number = 2;
  while (await occupied(candidate)) candidate = `${fallback.slice(0, -3)}-${number++}.md`;
  return candidate;
}

function markdownLines(markdown: string): readonly string[] {
  return markdown === "" ? [] : markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
}

function changeSummary(before: string, after: string) {
  const beforeLines = markdownLines(before);
  const afterLines = markdownLines(after);
  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start += 1;
  let beforeEnd = beforeLines.length;
  let afterEnd = afterLines.length;
  while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const removed = beforeEnd - start;
  const added = afterEnd - start;
  const modified = Math.min(removed, added);
  return { added: added - modified, removed: removed - modified, modified };
}

function legacyDefaultTab<FetchInput>(resource: Resource, catalog: ServiceCatalog<FetchInput>): Source | null {
  if (resource.type !== "document" || !resource.id.startsWith("google-docs:") || resource.id.includes("#tab=")) return null;
  for (const url of resource.urls) {
    const parsed = new URL(url);
    const service = catalog.find((item) => item.name === "google-docs" && item.matches(parsed));
    const source = service?.parse(parsed);
    if (source && source["document_tab"] === "t.0" && resource.id === `google-docs:${source["document_id"]}`) return source;
  }
  return null;
}

function findResource<FetchInput>(resources: readonly Resource[], source: Source, catalog: ServiceCatalog<FetchInput>): Resource | null {
  const current = resources.find((item) => item.identifiers.some((identifier) => identifier.service === source.service && identifier.identifier === source.identifier));
  if (source.service !== "google-docs" || source.type !== "document") return current ?? null;
  if (current && legacyDefaultTab(current, catalog) && !source["document_tab"]) throw new Error(`The existing file ${primaryLink(current).path} is registered to the explicit default tab. Sync that path before attaching the whole document.`);
  if (source["document_tab"] !== "t.0") return current ?? null;
  const legacy = resources.find((item) => item.id === `google-docs:${source["document_id"]}` && legacyDefaultTab(item, catalog) !== null);
  if (!legacy) return current ?? null;
  if (current && stableJsonCompact({ ...legacy, id: resourceId(source), identifiers: [{ service: source.service, identifier: source.identifier }] }) !== stableJsonCompact(current)) {
    throw new Error(`Two Wire records point to the default tab: ${primaryLink(legacy).path} and ${primaryLink(current).path}. Back up both files and reconcile them before detaching the duplicate by its resource ID (${current.id}). No files were changed.`);
  }
  return legacy;
}

function jsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function syncBase(service: string, snapshot: JsonValue, data: readonly ResourceData[]): JsonValue {
  if (service !== "notion") return snapshot;
  const sync = data.find((item) => item.namespace === "notion" && item.key === "sync")?.value;
  if (sync === undefined || !jsonObject(snapshot) || !jsonObject(sync) || sync["user_mentions"] === undefined) return snapshot;
  return { ...snapshot, user_mentions: sync["user_mentions"] };
}

function markdownSnapshot(snapshot: JsonValue): string | null {
  if (!jsonObject(snapshot)) return null;
  const markdown = snapshot["markdown"];
  return typeof markdown === "string" ? markdown : null;
}

function storedSnapshot(fetched: FetchedDocument): JsonValue {
  if (!jsonObject(fetched.data)) return fetched.data;
  return { ...fetched.data, markdown: fetched.markdown };
}

function pathLikeResourceValue(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.includes("/") || value.includes("\\") || value.endsWith(".md");
}

function relativePathContains(parent: string, child: string): boolean {
  return parent === "" || child === parent || child.startsWith(`${parent}/`);
}

function relativePathEscapes(path: string): boolean {
  return path === ".." || path.startsWith("../");
}

function serviceCanSynchronize<FetchInput>(url: string, catalog: ServiceCatalog<FetchInput>): boolean {
  const parsed = new URL(url);
  return catalog.find((service) => service.matches(parsed))!.synchronize !== undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error["message"] === "string") return error["message"];
  if (typeof error === "object" && error !== null) return JSON.stringify(error);
  return String(error);
}

export { withHistoryLock };
export const sourceLock = (source: Source) => source.service === "google-docs" && source.type === "document" ? "google-docs:" + String(source["document_id"] ?? source.identifier.split("#tab=")[0]) : resourceId(source);

export function composeWire<FetchInput>(dependencies: WireDependencies<FetchInput>): Wire {
  const durable = (registry: Registry) => registry instanceof FileRegistry || registry instanceof SqliteRegistry;
  const locked = async <T>(root: string, registry: Registry, key: string, fn: () => Promise<T>) => durable(registry) ? withHistoryLock(root, key, fn) : fn();
  const owner = async (registry: Registry, source: Source, url: string) => assertWireOwner(await registry.listResources(), source, dependencies.catalog.find(s => s.matches(new URL(url)))!);
  const historyFor = async (root: string, registry: Registry, source: Source) => durable(registry) ? DocumentHistory.load(root, resourceId(source), dependencies.now) : null;
  const restore = async (root: string, registry: Registry, source: Source, path?: string) => {
    const history = await historyFor(root, registry, source);
    await history?.recover(path, r => registry.put(r));
    return history;
  };
  const checkReceiptLink = (resource: Resource | null, h?: DocumentHistory | null) => {
    if (resource && (primaryLink(resource).data["editor_receipts"] === true) !== !!h?.refs.editorReceipts) throw new Error("Missing Wire editor receipt history or link registration. Restore the link and its private history before syncing.");
  };
  const store = async (url: string, path: string, fetched: FetchedDocument, previousMarkdown: string | null | undefined, action: WireAction, fixedOutputPath: string | undefined, summaryMarkdown: string | undefined, summaryAfterMarkdown: string, history?: DocumentHistory | null, enableReceipts = false, expectedRaw?: string | null): Promise<WireResult> => {
    const source = parseSourceUrl(url, dependencies.catalog);
    const root = await wireRoot(dependencies, path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const current = findResource(await registry.listResources(), source, dependencies.catalog);
    if (current && legacyDefaultTab(current, dependencies.catalog)) throw new Error(`Sync ${primaryLink(current).path} first to migrate its default-tab registration.`);
    let outputPath: string;
    if (current !== null) outputPath = join(dirname(root), primaryLink(current).path);
    else if (fixedOutputPath !== undefined) outputPath = fixedOutputPath;
    else {
      outputPath = await availableMarkdownPath(path, fetched.title, source.service, source.identifier, async (candidate) =>
        await dependencies.filesystem.exists(candidate) || (await registry.findByPath(dependencies.workspace.relativePath(candidate, root))).length > 0);
    }
    const relativePath = dependencies.workspace.relativePath(outputPath, root);
    checkReceiptLink(current, history);
    plainMarkdown(fetched.markdown);
    const raw = history ? await working(outputPath) : await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : null;
    const view = raw === null ? null : history ? history.view(raw) : editorView(raw);
    const onDisk = view?.markdown ?? null;
    if (expectedRaw !== undefined && raw !== expectedRaw && (enableReceipts || history?.refs.editorReceipts)) throw new Error("Local file changed during sync; run wire sync again.");
    if (!current && fixedOutputPath === undefined && onDisk !== null) throw new Error("Another file appeared at the proposed attachment path; retry attach.");
    const previous = (previousMarkdown === undefined ? onDisk : previousMarkdown) ?? "";
    const concurrentEdit = previousMarkdown !== undefined && onDisk !== previousMarkdown && onDisk !== fetched.markdown;
    const retry = `Local file changed during sync: ${relativePath}. Local changes were preserved. Run wire sync again.`;
    // Only advance the common base if the editor saw that version. Otherwise a retry
    // could mistake remote additions that never reached disk for local deletions.
    if (concurrentEdit && current !== null && fetched.markdown !== previousMarkdown) {
      if (history) { await history.observe(fetched); await history.save(); }
      throw new Error(retry);
    }
    if (action === "attached" && current !== null) {
      const snapshot = current.data.find((item) => item.namespace === source.service && item.key === "snapshot")!.value;
      const baseMarkdown = markdownSnapshot(syncBase(source.service, snapshot, current.data)) ?? (history?.refs.base ? await history.text(history.refs.base) : null);
      if (baseMarkdown !== null && previous !== baseMarkdown) throw new Error(`Local edits exist for ${primaryLink(current).path}. Run \`wire sync ${primaryLink(current).path}\` before attaching this URL again.`);
    }

    const id = resourceId(source);
    const primary = current?.filesystem_links.find((link) => link.path === relativePath && link.role === "primary");
    const link = { path: relativePath, role: "primary", data: { format: "markdown", ...primary?.data, ...(enableReceipts ? {editor_receipts: true} : {}) } };
    const resource: Resource = {
      id,
      type: source.type,
      identifiers: [{ service: source.service, identifier: source.identifier }],
      urls: [url],
      filesystem_links: current === null
        ? [link]
        : [
          ...current.filesystem_links.filter((link) => !(link.path === relativePath && link.role === "primary")),
          link,
        ],
      data: [
        ...(current?.data.filter((item) => item.namespace !== "wire" && !(item.namespace === source.service && item.key === "snapshot")) ?? []),
        { namespace: "wire", key: "title", value: fetched.title },
        { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
        { namespace: source.service, key: "snapshot", value: storedSnapshot(fetched) },
      ],
      relationships: extractRelationships(fetched.markdown, id, dependencies.catalog),
    };
    let stored: Resource;
    if (history) {
      if (history.refs.conflict) throw new Error("Unresolved Wire conflict. Review the saved revisions and use wire resolve.");
      const currentBase = history.refs.base;
      if (onDisk !== null && currentBase !== null && onDisk !== await history.text(currentBase) && (previousMarkdown === undefined || previousMarkdown === onDisk)) await history.captureLocal(onDisk, view?.shown ?? undefined);
      const draft = history.refs.draft;
      let next: string;
      if (currentBase === null) {
        const input = previousMarkdown === undefined || previousMarkdown === null || previousMarkdown === fetched.markdown ? null : await history.revision("local", previousMarkdown, []);
        next = await history.revision("attach", fetched.markdown, [input]);
      }
      else if (draft !== null && draft !== currentBase && action !== "downloaded") {
        const remote = history.refs.remote;
        const merged = remote !== null && (remote !== currentBase || (view?.base != null && view.base !== currentBase));
        next = await history.revision(merged ? "merge" : "local", fetched.markdown, merged ? [draft, remote] : [draft]);
      } else next = await history.observe(fetched);
      const refs: typeof history.refs = { ...history.refs, base: next, remote: next, draft: null, strict: false, resolution: null, resolutionParent: null, conflict: null };
      delete refs.editorDraft;
      // A confirmed push of the exact draft the editor already saw is safe to
      // acknowledge even if another save arrived while it was in flight.
      if (concurrentEdit && previousMarkdown === fetched.markdown) {
        await history.publish(outputPath, onDisk ?? "", onDisk ?? "", refs, resource, r => registry.put(r), true);
        stored = await registry.get(resource.id);
      } else if (concurrentEdit) {
        if (current !== null) throw new Error(retry);
        refs.base = previousMarkdown == null ? next : await history.revision("local", previousMarkdown, []);
        refs.resolution = fetched;
        refs.resolutionParent = next;
        await history.publish(outputPath, onDisk ?? "", onDisk ?? "", refs, resource, r => registry.put(r), true);
        stored = await registry.get(resource.id);
      } else {
        if (enableReceipts || refs.editorReceipts) refs.editorReceipts = { ...refs.editorReceipts };
        const materialized = refs.editorReceipts ? editorFile(fetched.markdown, refs.editorReceipts, next, next) : fetched.markdown;
        await history.publish(outputPath, raw, materialized, refs, resource, r => registry.put(r));
        stored = await registry.get(resource.id);
      }
    } else {
      if (!concurrentEdit && onDisk !== fetched.markdown) await dependencies.filesystem.writeText(outputPath, fetched.markdown);
      stored = await registry.put(resource);
    }
    if (concurrentEdit) throw new Error(retry);
    const changes = changeSummary(summaryMarkdown ?? previous, summaryAfterMarkdown);
    const resolvedAction = action === "attached" && current !== null && previous !== "" ? changes.added === 0 && changes.modified === 0 && changes.removed === 0 ? "synced" : "downloaded" : action;
    return { resource: stored, path: outputPath, markdown: fetched.markdown, summary: { action: resolvedAction, ...changes, remote: url, local: outputPath } };
  };

  const attach = async (url: string, path: string, editorReceipts = false): Promise<WireResult> => {
    return attachAt(url, path, undefined, editorReceipts);
  };
  const attachAt = async (url: string, path: string, fixed?: string, editorReceipts = false): Promise<WireResult> => {
    const root = await wireRoot(dependencies, path), registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const source = parseSourceUrl(url, dependencies.catalog);
    return locked(root, registry, sourceLock(source), async () => {
      await owner(registry, source, url);
      const h = await restore(root, registry, source);
      const current = findResource(await registry.listResources(), source, dependencies.catalog);
      checkReceiptLink(current, h);
      if (editorReceipts && (!h || source.service !== "google-docs" || source.type !== "document" || dependencies.catalog.find(s => s.matches(new URL(url)))?.owner !== undefined)) throw new Error("Editor receipts require a generic Google Docs Markdown link with durable history.");
      if (current && fixed !== undefined && join(dirname(root), primaryLink(current).path) !== fixed) throw new Error("This URL is already attached at another path.");
      if (fixed !== undefined && (await registry.findByPath(dependencies.workspace.relativePath(fixed, root))).some(r => r.id !== resourceId(source))) throw new Error("This file already has another registration.");
      if (h && current) await h.seed(markdownSnapshot(current.data.find(i => i.namespace === source.service && i.key === "snapshot")?.value ?? null));
      if (h?.refs.conflict) throw new Error("Unresolved Wire conflict. Use wire resolve.");
      if (h?.refs.strict) throw new Error("Sync the pending Wire draft before attaching again.");
      const trackedPath = current ? join(dirname(root), primaryLink(current).path) : fixed;
      const raw = trackedPath && h ? await working(trackedPath) : undefined;
      const existing = raw == null ? raw : h!.view(raw).markdown;
      const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
      if (fixed !== undefined && (h ? existing : await dependencies.filesystem.readText(fixed)) !== fetched.markdown) throw new Error("Cannot adopt: the existing file differs from the remote document.");
      return store(url, path, fetched, fixed === undefined ? undefined : fetched.markdown, "attached", fixed, undefined, fetched.markdown, h, editorReceipts, raw);
    });
  };
  const create = attach;

  const view = (url: string) => fetchSource(dependencies.fetchInput, url, dependencies.catalog);

  const downloadSource = async (url: string, path: string): Promise<WireResult> => {
    const source = parseSourceUrl(url, dependencies.catalog);
    const directory = resolve(path);
    const downloadPath = (path: string) => {
      const target = resolve(directory, path);
      const child = relative(directory, target);
      if (isAbsolute(path) || path.includes("\\") || child === "" || child === ".." || child.startsWith(`..${sep}`)) throw new Error(`Unsafe download path: ${path}`);
      return target;
    };
    const service = dependencies.catalog.find((item) => item.matches(new URL(url)))!;
    const additions = new Map<string, boolean>();
    const addMarkdown = async (path: string, contents: string) => {
      if (!path.endsWith(".md") || !dependencies.filesystem.createText) throw new Error("This filesystem does not support additive Markdown archives");
      for (let version = 1; ; version++) {
        const candidate = version === 1 ? path : path.slice(0, -3) + "." + version + ".md";
        const target = downloadPath(candidate);
        const created = await dependencies.filesystem.createText(target, contents);
        if (created || await dependencies.filesystem.readText(target) === contents) {
          additions.set(target, created);
          return candidate;
        }
      }
    };
    const downloaded = await service.download?.(dependencies.fetchInput, url, source, async (relative, contents) => {
      const target = downloadPath(relative);
      if (typeof contents === "string") await dependencies.filesystem.writeText(target, contents);
      else {
        if (dependencies.filesystem.writeBytes === undefined) throw new Error("This filesystem does not support binary downloads");
        await dependencies.filesystem.writeBytes(target, contents);
      }
    }, addMarkdown);
    const fetched = downloaded ?? await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    const outputPath = downloaded == null
      ? await availableMarkdownPath(directory, fetched.title, source.service, source.identifier, async (candidate) =>
        await dependencies.filesystem.exists(candidate) && (!await dependencies.filesystem.isFile(candidate) || await dependencies.filesystem.readText(candidate) !== fetched.markdown))
      : downloadPath(downloaded.path);
    const previous = !additions.get(outputPath) && await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    if (!additions.has(outputPath)) await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    const id = resourceId(source);
    const resource: Resource = {
      id,
      type: source.type,
      identifiers: [{ service: source.service, identifier: source.identifier }],
      urls: [url],
      filesystem_links: [{ path: relative(directory, outputPath), role: "primary", data: { format: "markdown" } }],
      data: [
        { namespace: "wire", key: "title", value: fetched.title },
        { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
        { namespace: source.service, key: "snapshot", value: storedSnapshot(fetched) },
      ],
      relationships: extractRelationships(fetched.markdown, id, dependencies.catalog),
    };
    return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: downloaded?.error === undefined ? "downloaded" : "failed", ...changeSummary(previous, fetched.markdown), remote: url, local: outputPath, ...(downloaded?.error === undefined ? {} : { error: downloaded.error }) } };
  };

  const resolveResource = async (registry: Registry, value: string, root: string, path: string): Promise<Resource> => {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const source = parseSourceUrl(value, dependencies.catalog);
      const resources = await registry.listResources();
      const resource = findResource(resources, source, dependencies.catalog);
      if (resource === null) throw new Error(`Resource URL not found: ${value}`);
      return resource;
    }
    const candidatePath = resolve(path, value);
    const relativePath = dependencies.workspace.relativePath(candidatePath, root);
    const resources = await registry.findByPath(relativePath);
    if (resources.length > 0 || await dependencies.filesystem.exists(candidatePath)) {
      if (resources.length === 0) throw new Error(`Resource path is not registered: ${value}`);
      if (resources.length === 2) {
        const tab = resources.map((item) => legacyDefaultTab(item, dependencies.catalog)).find((item) => item !== null);
        if (tab && resources.some((item) => item.id === resourceId(tab))) return findResource(resources, tab, dependencies.catalog)!;
      }
      if (resources.length > 1) throw new Error(`Ambiguous resource path ${relativePath}: ${resources.map((resource) => resource.id).join(", ")}. Use a resource id or URL.`);
      return resources[0]!;
    }
    if (pathLikeResourceValue(value)) throw new Error(`Resource path not found: ${value}`);
    return registry.get(value);
  };

  const syncInner = async (value: string, path: string): Promise<WireResult> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const relativePath = dependencies.workspace.relativePath(candidatePath, root);
    const pathResources = await registry.findByPath(relativePath);
    if (pathResources.length === 0 && await dependencies.filesystem.exists(candidatePath)) {
      const markdown = durable(registry) ? await working(candidatePath) : await dependencies.filesystem.readText(candidatePath);
      if (markdown === null) throw new Error("Cannot upload a missing Markdown file.");
      const uploaded = await uploadSource(dependencies.fetchInput, dependencies.catalog, plainMarkdown(markdown), candidatePath);
      const source = parseSourceUrl(uploaded.url, dependencies.catalog);
      return locked(root, registry, sourceLock(source), async () => store(uploaded.url, dirname(candidatePath), uploaded, markdown, "uploaded", candidatePath, undefined, uploaded.markdown, await restore(root, registry, source)));
    }
    let resource = await resolveResource(registry, value, root, path);
    const outputPath = join(dirname(root), primaryLink(resource).path);
    const outputDirectory = dirname(outputPath);
    const source = legacyDefaultTab(resource, dependencies.catalog) ?? parseSourceUrl(resource.urls[0]!, dependencies.catalog);
    await owner(registry, source, resource.urls[0]!);
    const history = await restore(root, registry, source, outputPath);
    resource = await registry.get(resource.id);
    if (history?.refs.conflict) throw new Error("Unresolved Wire conflict. Inspect wire conflicts and use wire resolve.");
    const snapshot = resource.data.find((item) => item.namespace === source.service && item.key === "snapshot")?.value;
    if (snapshot === undefined) throw new Error(`Missing saved snapshot for ${primaryLink(resource).path}. Keep the local file and download a separate copy to reconcile before syncing.`);
    if (!(await dependencies.filesystem.exists(outputPath))) throw new Error(`Linked file missing: ${primaryLink(resource).path} - restore it or run wire detach`);
    checkReceiptLink(resource, history);
    const raw = history ? await working(outputPath) : await dependencies.filesystem.readText(outputPath);
    if (raw === null) throw new Error("Linked file missing: " + outputPath);
    const view = history ? history.view(raw) : editorView(raw);
    const markdown = view.markdown;
    if (view.shown && history?.refs.editorDraft && view.shown !== history.refs.editorDraft) throw new Error("An older editor buffer replaced a pending Wire draft. Both versions were kept; reconcile them before syncing.");
    // A stale receipt proves Markdown ancestry, not native paragraph positions.
    // Never attach a newer snapshot's verified revision or IDs to older bytes.
    const base = view.base && history && view.base !== history.refs.base && view.base !== history.refs.resolutionParent
      ? { markdown: await history.text(view.base) }
      : history?.refs.resolution && (!view.base || view.base === history.refs.resolutionParent) ? storedSnapshot(history.refs.resolution) : syncBase(source.service, snapshot, resource.data);
    if (history) await history.seed(markdownSnapshot(snapshot));
    const baseMarkdown = markdownSnapshot(base) ?? (history?.refs.base ? await history.text(history.refs.base) : null);
    const localChanged = baseMarkdown !== null && markdown !== baseMarkdown;
    if (localChanged && !history?.refs.strict && !serviceCanSynchronize(resource.urls[0]!, dependencies.catalog)) throw new Error(`${source.service} is download-only and the local file has edits. Run \`wire download ${primaryLink(resource).path}\` to discard them.`);
    if (source.service === "google-docs" && source["document_tab"] === "t.0") {
      const registered = findResource(await registry.listResources(), source, dependencies.catalog);
      if (registered && legacyDefaultTab(registered, dependencies.catalog)) {
        if (registered.urls.length !== 1 || registered.identifiers.length !== 1 || registered.identifiers[0]!.identifier !== source["document_id"] || registered.filesystem_links.filter((link) => link.role === "primary").length !== 1 || !registry.rekey) {
          throw new Error(`Cannot migrate the ambiguous default-tab registration ${registered.id}. Back up the linked files and check the URLs, primary paths, and registry backend before syncing. No files were changed.`);
        }
        if (baseMarkdown === null || markdown !== baseMarkdown) {
          throw new Error(`Cannot migrate the old default-tab registration for ${primaryLink(registered).path}. Copy the local file somewhere safe, restore the linked file to its saved snapshot, then sync it and reapply only the edits for this tab. The local file and saved snapshot were kept.`);
        }
        await registry.rekey(registered, { service: source.service, identifier: source.identifier });
      }
    }
    if (history && (localChanged || history.refs.draft !== null)) await history.captureLocal(markdown, view.shown ?? undefined);
    const strict = (history?.refs.strict === true || view.base !== null) && localChanged;
    if (history && strict && source.service !== "notion" && !(source.service === "google-docs" && source.type === "document")) {
      const remote = await fetchSource(dependencies.fetchInput, resource.urls[0]!, dependencies.catalog);
      await history.observe(remote); await history.save();
      if (remote.markdown !== markdown) throw new Error("This provider cannot conditionally publish a Wire draft. The local revision was kept. Apply it in the provider, then sync to verify.");
      return store(resource.urls[0]!, outputDirectory, remote, markdown, "synced", undefined, undefined, remote.markdown, history);
    }
    const observed: { remote?: FetchedDocument } = {};
    let observations = Promise.resolve();
    const fork = view.base ?? (history?.refs.resolution ? history.refs.resolutionParent : history?.refs.base);
    let fetched;
    try {
      fetched = await synchronizeSource(dependencies.fetchInput, resource.urls[0]!, dependencies.catalog, base, markdown, outputPath, remote => {
        plainMarkdown(remote.markdown);
        observed.remote = remote;
        observations = observations.then(async () => { if (history) { await history.observe(remote); await history.save(); } });
        return observations;
      }, strict);
      await observations;
    } catch (error) {
      await observations;
      if (history && error instanceof WireMergeConflict && observed.remote && history.refs.draft && history.refs.remote) {
        if (fork) {
          history.refs.conflict = { base: fork, local: history.refs.draft, remote: history.refs.remote };
          history.refs.resolution = observed.remote;
          history.refs.resolutionParent = history.refs.remote;
          await history.save();
          throw new Error("Unresolved Wire conflict. " + error.message + " Inspect wire conflicts and use wire resolve.", { cause: error });
        }
      }
      throw error;
    }
    if (history && !observed.remote && fetched.markdown !== markdown) { await history.observe(fetched); await history.save(); }
    const uploaded = fetched.wroteRemote ?? (localChanged && fetched.markdown !== baseMarkdown);
    const action = uploaded ? "uploaded" : fetched.markdown === markdown || (localChanged && fetched.markdown === baseMarkdown) ? "synced" : "downloaded";
    return store(resource.urls[0]!, outputDirectory, fetched, markdown, action, undefined, action === "uploaded" && baseMarkdown !== null ? baseMarkdown : undefined, action === "uploaded" ? markdown : fetched.markdown, history, false, raw);
  };

  const underResourceLock = async <T>(value: string, path: string, fn: () => Promise<T>) => {
    const candidate = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidate) ? candidate : path), registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const ids = await registry.findByPath(dependencies.workspace.relativePath(candidate, root));
    const key = !ids.length && await dependencies.filesystem.exists(candidate) ? "path:" + dependencies.workspace.relativePath(candidate, root) : sourceLock(parseSourceUrl((await resolveResource(registry, value, root, path)).urls[0]!, dependencies.catalog));
    return locked(root, registry, key, fn);
  };
  const sync = (v: string, p: string) => underResourceLock(v, p, () => syncInner(v, p));
  const downloadInner = async (value: string, path: string): Promise<WireResult> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = join(dirname(root), primaryLink(resource).path);
    const source = parseSourceUrl(resource.urls[0]!, dependencies.catalog);
    await owner(registry, source, resource.urls[0]!);
    const h = await restore(root, registry, source, outputPath);
    await h?.seed(markdownSnapshot(resource.data.find(i => i.namespace === source.service && i.key === "snapshot")?.value ?? null));
    if (h?.refs.conflict) throw new Error("Unresolved Wire conflict. Use wire resolve.");
    checkReceiptLink(resource, h);
    const raw = h ? await working(outputPath) : await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : null;
    const markdown = raw === null ? null : (h ? h.view(raw) : editorView(raw)).markdown;
    if (h?.refs.strict && h.refs.draft) throw new Error("Sync the pending Wire draft before downloading over it.");
    const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0]!, dependencies.catalog);
    return store(resource.urls[0]!, dirname(outputPath), fetched, markdown, "downloaded", undefined, undefined, fetched.markdown, h, false, raw);
  };

  const download = (v: string, p: string) => underResourceLock(v, p, () => downloadInner(v, p));
  const detachInner = async (value: string, path: string): Promise<WireResult> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = join(dirname(root), primaryLink(resource).path);
    const initialRaw = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : null;
    const source = parseSourceUrl(resource.urls[0]!, dependencies.catalog);
    await owner(registry, source, resource.urls[0]!);
    const h = await restore(root, registry, source, outputPath);
    checkReceiptLink(resource, h);
    const previousView = initialRaw === null ? null : (h ? h.view(initialRaw) : editorView(initialRaw));
    const previous = previousView?.markdown ?? "";
    if (h?.refs.conflict || h?.refs.strict) throw new Error("Resolve and sync the Wire draft before detaching.");
    const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0]!, dependencies.catalog);
    if (h) {
      const onDisk = await working(outputPath);
      if (onDisk !== initialRaw) throw new Error("Local file changed during detach; retry.");
      if (previousView) await h.captureLocal(previousView.markdown, previousView.shown ?? undefined);
      const next = await h.observe(fetched);
      const {editorReceipts: _receipts, ...plainRefs} = h.refs;
      await h.publish(outputPath, onDisk, fetched.markdown, { ...plainRefs, base: next, remote: next, draft: null }, null, r => registry.put(r));
    } else await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    await registry.delete(resource.id);
    return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: "detached", ...changeSummary(previous, fetched.markdown), remote: resource.urls[0]!, local: outputPath } };
  };
  const detach = (v: string, p: string) => underResourceLock(v, p, () => detachInner(v, p));
  const unlink = detach;

  const runWatchHooks = async (hooks: readonly WireWatchSyncHook[], command: WireWatchSyncCommand, result: WireResult): Promise<WireResult> => {
    let current = result;
    for (const hook of hooks) current = await hook(command, current);
    return current;
  };

  const watchWithHooks = async (value: string, path: string, hooks: readonly WireWatchSyncHook[]): Promise<WireWatchSession> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const config = watchConfig(await dependencies.workspace.loadConfig!(root));
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = join(dirname(root), primaryLink(resource).path);
    const initial = await dependencies.filesystem.exists(outputPath) ? null : await runWatchHooks(hooks, "download", await download(value, path));
    let lastSyncedMarkdown = initial === null ? await dependencies.filesystem.readText(outputPath) : initial.markdown;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolveClosedPromise) => { resolveClosed = resolveClosedPromise; });
    const handles: WatchHandle[] = [];
    let active = false, pending = false, poll = false, stopped = false;
    const synchronize = async (forcePoll: boolean) => {
      if (stopped) return;
      pending = true;
      poll ||= forcePoll;
      if (active) return;
      active = true;
      try {
        while (pending && !stopped) {
          const checkRemote = poll;
          pending = poll = false;
          try {
            if (!checkRemote && await dependencies.filesystem.readText(outputPath) === lastSyncedMarkdown) continue;
            const result = config.mode === "download" ? await runWatchHooks(hooks, "download", await download(value, path)) : await runWatchHooks(hooks, "sync", await sync(value, path));
            lastSyncedMarkdown = result.markdown;
            if (primaryLink(result.resource).data["editor_receipts"] === true) {
              const h = await historyFor(root, registry, parseSourceUrl(result.resource.urls[0]!, dependencies.catalog));
              if (h?.refs.editorReceipts && h.refs.base && await h.text(h.refs.base) === result.markdown) {
                lastSyncedMarkdown = editorFile(result.markdown, h.refs.editorReceipts, h.refs.base, h.refs.base);
              }
            }
          } catch (error) {
            console.warn(`Wire watch: ${errorMessage(error)}`);
          }
        }
      } finally {
        active = false;
        if (stopped) resolveClosed();
      }
    };
    handles.push(dependencies.watch!.every(config.pollMs, () => synchronize(true)));
    if (config.mode === "two-way") {
      handles.push(dependencies.watch!.watchFile(outputPath, () => {
        if (debounce !== undefined) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = undefined;
          void synchronize(false);
        }, config.debounceMs);
      }));
    }
    return Object.freeze({
      resource,
      path: outputPath,
      mode: config.mode,
      debounceMs: config.debounceMs,
      pollMs: config.pollMs,
      closed,
      close: () => {
        stopped = true;
        if (debounce !== undefined) clearTimeout(debounce);
        for (const handle of handles) handle.close();
        if (!active) resolveClosed();
      },
    });
  };

  const watch = (value: string, path: string): Promise<WireWatchSession> => watchWithHooks(value, path, []);

  const openResource = async (value: string, path: string): Promise<Resource> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    await dependencies.open(resource.urls[0]!);
    return resource;
  };

  const syncAll = async (path: string): Promise<readonly WireResult[]> => {
    const root = await wireRoot(dependencies, path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const scope = dependencies.workspace.relativePath(path, root);
    if (relativePathEscapes(scope)) throw new Error(`Sync scope is outside the Wire workspace: root ${dirname(root)}, path ${path}`);
    const results: WireResult[] = [];
    for (const resource of await registry.listResources()) {
      const outputPath = join(dirname(root), primaryLink(resource).path);
      if (relativePathContains(scope, primaryLink(resource).path)) {
        try {
          results.push(await sync(resource.id, dirname(outputPath)));
        } catch (error) {
          results.push({ resource, path: outputPath, markdown: "", summary: { action: "failed", added: 0, modified: 0, removed: 0, remote: resource.urls[0]!, local: outputPath, error: errorMessage(error) } });
        }
      }
    }
    return results;
  };

  const listResources = async (path: string): Promise<readonly Resource[]> => {
    const root = await wireRoot(dependencies, path);
    return (await dependencies.workspace.openRegistry(root, dependencies.home)).listResources();
  };

  const showResource = async (value: string, path: string): Promise<Resource> => {
    const candidatePath = resolve(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    return resolveResource(registry, value, root, path);
  };

  const withDocument = async <T>(v: string, p: string, run: (h: DocumentHistory, path: string, registry: Registry, resource: Resource) => Promise<T>) => underResourceLock(v, p, async () => {
    const candidate = resolve(p, v), root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidate) ? candidate : p);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    let r = await resolveResource(registry, v, root, p);
    const path = join(dirname(root), primaryLink(r).path);
    const source = parseSourceUrl(r.urls[0]!, dependencies.catalog);
    const h = await restore(root, registry, source, path);
    if (!h) throw new Error("This registry does not provide durable document history.");
    r = await registry.get(r.id);
    checkReceiptLink(r, h);
    await h.seed(markdownSnapshot(r.data.find(i => i.namespace === source.service && i.key === "snapshot")?.value ?? null));
    return run(h, path, registry, r);
  });
  const historyStatus = (v: string, p: string) => withDocument(v, p, (h, path) => h.status(path));
  const historyLog = (v: string, p: string) => withDocument(v, p, h => h.log());
  const historyDiff = (v: string, p: string, from = "base", to = "working") => withDocument(v, p, async (h, path) => {
    const raw = await working(path);
    const current = raw === null ? null : h.view(raw).markdown;
    const text = async (ref: string) => {
      if (ref === "working") { if (current === null) throw new Error("Linked Markdown is missing."); return current; }
      const id = ref === "base" ? (h.refs.conflict?.base ?? h.refs.base) : ref === "remote" ? h.refs.remote : ref === "local" ? h.refs.conflict?.local ?? h.refs.draft ?? h.refs.base : ref;
      if (!id) throw new Error("No saved " + ref + " revision.");
      return h.text(id);
    };
    return { from, to, before: await text(from), after: await text(to), token: h.token(raw) };
  });
  const checkpoint = (v: string, p: string, expected: string, markdown: string, token: string) => withDocument(v, p, async (h, path, reg) => {
    const raw = await working(path);
    const view = raw === null ? null : h.view(raw);
    if (!view || view.markdown !== expected || token !== h.token(raw)) throw new Error("Stale shell edit. The document changed; rerun the command.");
    if (expected !== markdown) {
      if (view.shown && h.refs.editorDraft && view.shown !== h.refs.editorDraft) throw new Error("An older editor buffer replaced a pending Wire draft. Both versions were kept; reconcile them before editing.");
      plainMarkdown(markdown);
      const prior = await h.captureLocal(expected, view.shown ?? undefined);
      const draft = await h.revision("local", markdown, [prior]);
      const refs = { ...h.refs, draft, strict: true, ...(view.base ? {editorDraft: draft} : {}) };
      if (refs.editorReceipts) refs.editorReceipts = { ...refs.editorReceipts };
      const next = refs.editorReceipts && view.base ? editorFile(markdown, refs.editorReceipts, draft, view.base) : markdown;
      await h.publish(path, raw, next, refs, null, r => reg.put(r));
    }
    return h.status(path);
  });
  const resolveConflict = (v: string, p: string, choice: "local" | "remote" | "working") => withDocument(v, p, async (h, path, reg) => {
    const conflict = h.refs.conflict;
    if (!conflict || !h.refs.resolution) throw new Error("No saved conflict for this document.");
    const raw = await working(path);
    const current = raw === null ? null : h.view(raw).markdown;
    if (current === null) throw new Error("Linked Markdown is missing.");
    const local = await h.text(conflict.local), remote = await h.text(conflict.remote);
    if (choice !== "working" && current !== local) throw new Error("Working file changed since the conflict. Choose working to retain those edits.");
    if (!["working", "local", "remote"].includes(choice)) throw new Error("Choose local, remote or working.");
    const next = choice === "working" ? current : choice === "local" ? local : remote;
    const draft = await h.revision("resolve", next, [conflict.local, conflict.remote]);
    const refs = { ...h.refs, draft, strict: true, conflict: null, ...(h.refs.editorReceipts ? {editorDraft: draft} : {}) };
    if (refs.editorReceipts) refs.editorReceipts = { ...refs.editorReceipts };
    const materialized = refs.editorReceipts ? editorFile(next, refs.editorReceipts, draft, conflict.remote) : next;
    await h.publish(path, raw, materialized, refs, null, r => reg.put(r));
    return h.status(path);
  });

  return Object.freeze({
    attach,
    adopt: (url: string, path: string, editorReceipts = false) => attachAt(url, dirname(resolve(path)), resolve(path), editorReceipts),
    historyStatus, historyDiff, historyLog, checkpoint, resolveConflict,
    create,
    view,
    downloadSource,
    sync,
    download,
    detach,
    unlink,
    watch,
    openResource,
    syncAll,
    listResources,
    showResource,
    init: dependencies.workspace.initialize,
    switchBackend: async (path: string) => {
      const root = await wireRoot(dependencies, path);
      return dependencies.workspace.switchBackend!(dirname(root), dependencies.home);
    },
    [wireWatchHooks]: watchWithHooks,
  }) as WireInternal;
}
