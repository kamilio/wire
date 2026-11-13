import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { stableJsonCompact } from "./core/json.js";
import { extractRelationships, markdownFilename } from "./core/transform.js";
import { resourceId } from "./core/resource.js";
import { fetchSource, parseSourceUrl, synchronizeSource, uploadSource } from "./core/source.js";
export const wireWatchHooks = Symbol("wireWatchHooks");
async function wireRoot(dependencies, path) {
    const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
    if (configured !== null)
        return configured;
    return (await dependencies.workspace.initialize(dependencies.home, dependencies.initialization.backend, dependencies.initialization.registryPath)).root;
}
function watchConfig(config) {
    return {
        mode: config.watch?.mode ?? "two-way",
        debounceMs: config.watch?.debounceMs ?? 1000,
        pollMs: config.watch?.pollMs ?? 60000,
    };
}
function primaryLink(resource) {
    return resource.filesystem_links.find((link) => link.role === "primary");
}
function collisionFilename(title, service, identifier) {
    const base = markdownFilename(title).slice(0, -3);
    const suffix = `${service}-${identifier}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
    const compact = suffix.length <= 48 ? suffix : `${suffix.slice(0, 32).replace(/[-_.]+$/g, "")}-${createHash("sha256").update(suffix).digest("hex").slice(0, 10)}`;
    return `${base}-${compact}.md`;
}
async function availableMarkdownPath(directory, title, service, identifier, occupied) {
    const cleanPath = join(resolve(directory), markdownFilename(title));
    if (!await occupied(cleanPath))
        return cleanPath;
    const fallback = join(resolve(directory), collisionFilename(title, service, identifier));
    let candidate = fallback;
    let number = 2;
    while (await occupied(candidate))
        candidate = `${fallback.slice(0, -3)}-${number++}.md`;
    return candidate;
}
function markdownLines(markdown) {
    return markdown === "" ? [] : markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
}
function changeSummary(before, after) {
    const beforeLines = markdownLines(before);
    const afterLines = markdownLines(after);
    let start = 0;
    while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start])
        start += 1;
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
function legacyDefaultTab(resource, catalog) {
    if (resource.type !== "document" || !resource.id.startsWith("google-docs:") || resource.id.includes("#tab="))
        return null;
    for (const url of resource.urls) {
        const parsed = new URL(url);
        const service = catalog.find((item) => item.name === "google-docs" && item.matches(parsed));
        const source = service?.parse(parsed);
        if (source && source["document_tab"] === "t.0" && resource.id === `google-docs:${source["document_id"]}`)
            return source;
    }
    return null;
}
function findResource(resources, source, catalog) {
    const current = resources.find((item) => item.identifiers.some((identifier) => identifier.service === source.service && identifier.identifier === source.identifier));
    if (source.service !== "google-docs" || source.type !== "document")
        return current ?? null;
    if (current && legacyDefaultTab(current, catalog) && !source["document_tab"])
        throw new Error(`The existing file ${primaryLink(current).path} is registered to the explicit default tab. Sync that path before attaching the whole document.`);
    if (source["document_tab"] !== "t.0")
        return current ?? null;
    const legacy = resources.find((item) => item.id === `google-docs:${source["document_id"]}` && legacyDefaultTab(item, catalog) !== null);
    if (!legacy)
        return current ?? null;
    if (current && stableJsonCompact({ ...legacy, id: resourceId(source), identifiers: [{ service: source.service, identifier: source.identifier }] }) !== stableJsonCompact(current)) {
        throw new Error(`Two Wire records point to the default tab: ${primaryLink(legacy).path} and ${primaryLink(current).path}. Back up both files and reconcile them before detaching the duplicate by its resource ID (${current.id}). No files were changed.`);
    }
    return legacy;
}
function jsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function syncBase(service, snapshot, data) {
    if (service !== "notion")
        return snapshot;
    const sync = data.find((item) => item.namespace === "notion" && item.key === "sync")?.value;
    if (sync === undefined || !jsonObject(snapshot) || !jsonObject(sync) || sync["user_mentions"] === undefined)
        return snapshot;
    return { ...snapshot, user_mentions: sync["user_mentions"] };
}
function markdownSnapshot(snapshot) {
    if (!jsonObject(snapshot))
        return null;
    const markdown = snapshot["markdown"];
    return typeof markdown === "string" ? markdown : null;
}
function storedSnapshot(fetched) {
    if (!jsonObject(fetched.data))
        return fetched.data;
    return { ...fetched.data, markdown: fetched.markdown };
}
function pathLikeResourceValue(value) {
    return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.includes("/") || value.includes("\\") || value.endsWith(".md");
}
function relativePathContains(parent, child) {
    return parent === "" || child === parent || child.startsWith(`${parent}/`);
}
function relativePathEscapes(path) {
    return path === ".." || path.startsWith("../");
}
function serviceCanSynchronize(url, catalog) {
    const parsed = new URL(url);
    return catalog.find((service) => service.matches(parsed)).synchronize !== undefined;
}
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "object" && error !== null && "message" in error && typeof error["message"] === "string")
        return error["message"];
    if (typeof error === "object" && error !== null)
        return JSON.stringify(error);
    return String(error);
}
export function composeWire(dependencies) {
    const store = async (url, path, fetched, previousMarkdown, action, fixedOutputPath, summaryMarkdown, summaryAfterMarkdown) => {
        const source = parseSourceUrl(url, dependencies.catalog);
        const root = await wireRoot(dependencies, path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const current = findResource(await registry.listResources(), source, dependencies.catalog);
        if (current && legacyDefaultTab(current, dependencies.catalog))
            throw new Error(`Sync ${primaryLink(current).path} first to migrate its default-tab registration.`);
        let outputPath;
        if (current !== null)
            outputPath = join(dirname(root), primaryLink(current).path);
        else if (fixedOutputPath !== undefined)
            outputPath = fixedOutputPath;
        else {
            outputPath = await availableMarkdownPath(path, fetched.title, source.service, source.identifier, async (candidate) => await dependencies.filesystem.exists(candidate) || (await registry.findByPath(dependencies.workspace.relativePath(candidate, root))).length > 0);
        }
        const relativePath = dependencies.workspace.relativePath(outputPath, root);
        const onDisk = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : null;
        const previous = (previousMarkdown === undefined ? onDisk : previousMarkdown) ?? "";
        const concurrentEdit = previousMarkdown !== undefined && onDisk !== previousMarkdown && onDisk !== fetched.markdown;
        const retry = `Local file changed during sync: ${relativePath}. Local changes were preserved. Run wire sync again.`;
        // Only advance the common base if the editor saw that version. Otherwise a retry
        // could mistake remote additions that never reached disk for local deletions.
        if (concurrentEdit && current !== null && fetched.markdown !== previousMarkdown)
            throw new Error(retry);
        if (action === "attached" && current !== null) {
            const snapshot = current.data.find((item) => item.namespace === source.service && item.key === "snapshot").value;
            const baseMarkdown = markdownSnapshot(syncBase(source.service, snapshot, current.data));
            if (baseMarkdown !== null && previous !== baseMarkdown)
                throw new Error(`Local edits exist for ${primaryLink(current).path}. Run \`wire sync ${primaryLink(current).path}\` before attaching this URL again.`);
        }
        if (!concurrentEdit && onDisk !== fetched.markdown)
            await dependencies.filesystem.writeText(outputPath, fetched.markdown);
        const id = resourceId(source);
        const primary = current?.filesystem_links.find((link) => link.path === relativePath && link.role === "primary");
        const resource = {
            id,
            type: source.type,
            identifiers: [{ service: source.service, identifier: source.identifier }],
            urls: [url],
            filesystem_links: current === null
                ? [{ path: relativePath, role: "primary", data: { format: "markdown" } }]
                : [
                    ...current.filesystem_links.filter((link) => !(link.path === relativePath && link.role === "primary")),
                    primary ?? { path: relativePath, role: "primary", data: { format: "markdown" } },
                ],
            data: [
                ...(current?.data.filter((item) => item.namespace !== "wire" && !(item.namespace === source.service && item.key === "snapshot")) ?? []),
                { namespace: "wire", key: "title", value: fetched.title },
                { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
                { namespace: source.service, key: "snapshot", value: storedSnapshot(fetched) },
            ],
            relationships: extractRelationships(fetched.markdown, id, dependencies.catalog),
        };
        const stored = await registry.put(resource);
        if (concurrentEdit)
            throw new Error(retry);
        const changes = changeSummary(summaryMarkdown ?? previous, summaryAfterMarkdown);
        const resolvedAction = action === "attached" && current !== null && previous !== "" ? changes.added === 0 && changes.modified === 0 && changes.removed === 0 ? "synced" : "downloaded" : action;
        return { resource: stored, path: outputPath, markdown: fetched.markdown, summary: { action: resolvedAction, ...changes, remote: url, local: outputPath } };
    };
    const attach = async (url, path) => {
        const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
        return store(url, path, fetched, undefined, "attached", undefined, undefined, fetched.markdown);
    };
    const create = attach;
    const view = (url) => fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    const downloadSource = async (url, path) => {
        const source = parseSourceUrl(url, dependencies.catalog);
        const directory = resolve(path);
        const downloadPath = (path) => {
            const target = resolve(directory, path);
            const child = relative(directory, target);
            if (isAbsolute(path) || path.includes("\\") || child === "" || child === ".." || child.startsWith(`..${sep}`))
                throw new Error(`Unsafe download path: ${path}`);
            return target;
        };
        const service = dependencies.catalog.find((item) => item.matches(new URL(url)));
        const additions = new Map();
        const addMarkdown = async (path, contents) => {
            if (!path.endsWith(".md") || !dependencies.filesystem.createText)
                throw new Error("This filesystem does not support additive Markdown archives");
            for (let version = 1;; version++) {
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
            if (typeof contents === "string")
                await dependencies.filesystem.writeText(target, contents);
            else {
                if (dependencies.filesystem.writeBytes === undefined)
                    throw new Error("This filesystem does not support binary downloads");
                await dependencies.filesystem.writeBytes(target, contents);
            }
        }, addMarkdown);
        const fetched = downloaded ?? await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
        const outputPath = downloaded == null
            ? await availableMarkdownPath(directory, fetched.title, source.service, source.identifier, async (candidate) => await dependencies.filesystem.exists(candidate) && (!await dependencies.filesystem.isFile(candidate) || await dependencies.filesystem.readText(candidate) !== fetched.markdown))
            : downloadPath(downloaded.path);
        const previous = !additions.get(outputPath) && await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
        if (!additions.has(outputPath))
            await dependencies.filesystem.writeText(outputPath, fetched.markdown);
        const id = resourceId(source);
        const resource = {
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
    const resolveResource = async (registry, value, root, path) => {
        if (value.startsWith("http://") || value.startsWith("https://")) {
            const source = parseSourceUrl(value, dependencies.catalog);
            const resources = await registry.listResources();
            const resource = findResource(resources, source, dependencies.catalog);
            if (resource === null)
                throw new Error(`Resource URL not found: ${value}`);
            return resource;
        }
        const candidatePath = resolve(path, value);
        const relativePath = dependencies.workspace.relativePath(candidatePath, root);
        const resources = await registry.findByPath(relativePath);
        if (resources.length > 0 || await dependencies.filesystem.exists(candidatePath)) {
            if (resources.length === 0)
                throw new Error(`Resource path is not registered: ${value}`);
            if (resources.length === 2) {
                const tab = resources.map((item) => legacyDefaultTab(item, dependencies.catalog)).find((item) => item !== null);
                if (tab && resources.some((item) => item.id === resourceId(tab)))
                    return findResource(resources, tab, dependencies.catalog);
            }
            if (resources.length > 1)
                throw new Error(`Ambiguous resource path ${relativePath}: ${resources.map((resource) => resource.id).join(", ")}. Use a resource id or URL.`);
            return resources[0];
        }
        if (pathLikeResourceValue(value))
            throw new Error(`Resource path not found: ${value}`);
        return registry.get(value);
    };
    const sync = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const relativePath = dependencies.workspace.relativePath(candidatePath, root);
        const pathResources = await registry.findByPath(relativePath);
        if (pathResources.length === 0 && await dependencies.filesystem.exists(candidatePath)) {
            const markdown = await dependencies.filesystem.readText(candidatePath);
            const uploaded = await uploadSource(dependencies.fetchInput, dependencies.catalog, markdown, candidatePath);
            return store(uploaded.url, dirname(candidatePath), uploaded, markdown, "uploaded", candidatePath, undefined, uploaded.markdown);
        }
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const outputDirectory = dirname(outputPath);
        const source = legacyDefaultTab(resource, dependencies.catalog) ?? parseSourceUrl(resource.urls[0], dependencies.catalog);
        const snapshot = resource.data.find((item) => item.namespace === source.service && item.key === "snapshot")?.value;
        if (snapshot === undefined)
            throw new Error(`Missing saved snapshot for ${primaryLink(resource).path}. Keep the local file and download a separate copy to reconcile before syncing.`);
        if (!(await dependencies.filesystem.exists(outputPath)))
            throw new Error(`Linked file missing: ${primaryLink(resource).path} - restore it or run wire detach`);
        const markdown = await dependencies.filesystem.readText(outputPath);
        const base = syncBase(source.service, snapshot, resource.data);
        const baseMarkdown = markdownSnapshot(base);
        const localChanged = baseMarkdown !== null && markdown !== baseMarkdown;
        if (localChanged && !serviceCanSynchronize(resource.urls[0], dependencies.catalog))
            throw new Error(`${source.service} is download-only and the local file has edits. Run \`wire download ${primaryLink(resource).path}\` to discard them.`);
        if (source.service === "google-docs" && source["document_tab"] === "t.0") {
            const registered = findResource(await registry.listResources(), source, dependencies.catalog);
            if (registered && legacyDefaultTab(registered, dependencies.catalog)) {
                if (registered.urls.length !== 1 || registered.identifiers.length !== 1 || registered.identifiers[0].identifier !== source["document_id"] || registered.filesystem_links.filter((link) => link.role === "primary").length !== 1 || !registry.rekey) {
                    throw new Error(`Cannot migrate the ambiguous default-tab registration ${registered.id}. Back up the linked files and check the URLs, primary paths, and registry backend before syncing. No files were changed.`);
                }
                if (baseMarkdown === null || markdown !== baseMarkdown) {
                    throw new Error(`Cannot migrate the old default-tab registration for ${primaryLink(registered).path}. Copy the local file somewhere safe, restore the linked file to its saved snapshot, then sync it and reapply only the edits for this tab. The local file and saved snapshot were kept.`);
                }
                await registry.rekey(registered, { service: source.service, identifier: source.identifier });
            }
        }
        const fetched = await synchronizeSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog, base, markdown, outputPath);
        const action = localChanged ? fetched.markdown === baseMarkdown ? "synced" : "uploaded" : fetched.markdown === markdown ? "synced" : "downloaded";
        return store(resource.urls[0], outputDirectory, fetched, markdown, action, undefined, action === "uploaded" && baseMarkdown !== null ? baseMarkdown : undefined, action === "uploaded" ? markdown : fetched.markdown);
    };
    const download = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const markdown = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : null;
        const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
        return store(resource.urls[0], dirname(outputPath), fetched, markdown, "downloaded", undefined, undefined, fetched.markdown);
    };
    const detach = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const previous = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
        const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
        await dependencies.filesystem.writeText(outputPath, fetched.markdown);
        await registry.delete(resource.id);
        return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: "detached", ...changeSummary(previous, fetched.markdown), remote: resource.urls[0], local: outputPath } };
    };
    const unlink = detach;
    const runWatchHooks = async (hooks, command, result) => {
        let current = result;
        for (const hook of hooks)
            current = await hook(command, current);
        return current;
    };
    const watchWithHooks = async (value, path, hooks) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const config = watchConfig(await dependencies.workspace.loadConfig(root));
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const initial = await dependencies.filesystem.exists(outputPath) ? null : await runWatchHooks(hooks, "download", await download(value, path));
        let lastSyncedMarkdown = initial === null ? await dependencies.filesystem.readText(outputPath) : initial.markdown;
        let debounce;
        let resolveClosed;
        const closed = new Promise((resolveClosedPromise) => { resolveClosed = resolveClosedPromise; });
        const handles = [];
        let active = false, pending = false, poll = false, stopped = false;
        const synchronize = async (forcePoll) => {
            if (stopped)
                return;
            pending = true;
            poll ||= forcePoll;
            if (active)
                return;
            active = true;
            try {
                while (pending && !stopped) {
                    const checkRemote = poll;
                    pending = poll = false;
                    try {
                        if (!checkRemote && await dependencies.filesystem.readText(outputPath) === lastSyncedMarkdown)
                            continue;
                        const result = config.mode === "download" ? await runWatchHooks(hooks, "download", await download(value, path)) : await runWatchHooks(hooks, "sync", await sync(value, path));
                        lastSyncedMarkdown = result.markdown;
                    }
                    catch (error) {
                        console.warn(`Wire watch: ${errorMessage(error)}`);
                    }
                }
            }
            finally {
                active = false;
                if (stopped)
                    resolveClosed();
            }
        };
        handles.push(dependencies.watch.every(config.pollMs, () => synchronize(true)));
        if (config.mode === "two-way") {
            handles.push(dependencies.watch.watchFile(outputPath, () => {
                if (debounce !== undefined)
                    clearTimeout(debounce);
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
                if (debounce !== undefined)
                    clearTimeout(debounce);
                for (const handle of handles)
                    handle.close();
                if (!active)
                    resolveClosed();
            },
        });
    };
    const watch = (value, path) => watchWithHooks(value, path, []);
    const openResource = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        await dependencies.open(resource.urls[0]);
        return resource;
    };
    const syncAll = async (path) => {
        const root = await wireRoot(dependencies, path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const scope = dependencies.workspace.relativePath(path, root);
        if (relativePathEscapes(scope))
            throw new Error(`Sync scope is outside the Wire workspace: root ${dirname(root)}, path ${path}`);
        const results = [];
        for (const resource of await registry.listResources()) {
            const outputPath = join(dirname(root), primaryLink(resource).path);
            if (relativePathContains(scope, primaryLink(resource).path)) {
                try {
                    results.push(await sync(resource.id, dirname(outputPath)));
                }
                catch (error) {
                    results.push({ resource, path: outputPath, markdown: "", summary: { action: "failed", added: 0, modified: 0, removed: 0, remote: resource.urls[0], local: outputPath, error: errorMessage(error) } });
                }
            }
        }
        return results;
    };
    const listResources = async (path) => {
        const root = await wireRoot(dependencies, path);
        return (await dependencies.workspace.openRegistry(root, dependencies.home)).listResources();
    };
    const showResource = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        return resolveResource(registry, value, root, path);
    };
    return Object.freeze({
        attach,
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
        switchBackend: async (path) => {
            const root = await wireRoot(dependencies, path);
            return dependencies.workspace.switchBackend(dirname(root), dependencies.home);
        },
        [wireWatchHooks]: watchWithHooks,
    });
}
//# sourceMappingURL=operations.js.map