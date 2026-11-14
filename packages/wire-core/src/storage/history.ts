import { createHash, randomUUID } from "node:crypto";
import { constants, linkSync, readFileSync, renameSync, lstatSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { link, lstat, mkdir, open, readdir, readlink, rename, rm, stat, symlink, unlink } from "node:fs/promises";
import type { FetchedDocument, Resource } from "../core/model.js";
import { editorView, hasEditorReceipt, plainMarkdown, type EditorReceipts } from "./editor-receipts.js";
import { transactionId, validateRefs } from "./history-integrity.js";
import { stableJsonCompact } from "../core/json.js";

export type HistoryEntry = { id: string; parents: string[]; kind: "attach" | "local" | "remote" | "merge" | "resolve" | "recovered"; at: string };
export type HistoryConflict = { base: string; local: string; remote: string } | { editor: string; shell: string; editorBase: string; shellBase: string };
export type HistoryStatus = { path: string; base: string | null; modified: boolean; conflict: HistoryConflict | null };
export type HistoryDiff = { from: string; to: string; before: string; after: string; token: string };
type Revision = HistoryEntry & { blob: string };
export type HistoryRefs = {
  base: string | null; draft: string | null; remote: string | null; conflict: HistoryConflict | null;
  editorReceipts?: EditorReceipts; retiredEditorReceipts?: EditorReceipts; editorDraft?: string;
  strict: boolean; revisions: Revision[]; resolution: FetchedDocument | null; resolutionParent: string | null;
};
type Publication = { detached?: Resource; acknowledged: boolean; path: string; expected: string | null; next: string; token: string; refs: HistoryRefs; resource: Resource | null };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const code = (error: unknown) => (error as NodeJS.ErrnoException).code;
const missing = (error: unknown) => code(error) === "ENOENT";
async function exists(path: string) { return lstat(path).then(() => true, e => { if (missing(e)) return false; throw e; }); }
async function privateDirectory(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (e) { if (code(e) !== "EEXIST") throw e; }
  const info = await lstat(path);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error('Unsafe Wire history directory: ' + path);
}
export async function requireHistoryVolume(historyDirectory: string, markdownDirectory: string) {
  const [history, markdown] = await Promise.all([stat(historyDirectory), stat(markdownDirectory)]);
  if (history.dev !== markdown.dev) throw new Error("Wire history and tracked Markdown must be on the same filesystem. Run wire init in the document folder on that volume, then attach the source URL there. Keep any existing edits until you have reconciled the new attachment.");
}
async function syncDir(path: string) {
  const fd = await open(path, "r");
  try { await fd.sync(); } finally { await fd.close(); }
}
async function write(path: string, value: string, mode = 0o600) {
  const fd = await open(path, "wx", mode);
  try { await fd.writeFile(value); await fd.sync(); } finally { await fd.close(); }
}
async function json(path: string, value: unknown) {
  const tmp = join(dirname(path), randomUUID());
  try { await write(tmp, JSON.stringify(value)); await rename(tmp, path); await syncDir(dirname(path)); }
  finally { await rm(tmp, { force: true }); }
}
export async function working(path: string): Promise<string | null> {
  let fd;
  try { fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (e) { if (missing(e)) return null; throw e; }
  try {
    if (!(await fd.stat()).isFile()) throw new Error("Expected a regular Markdown file: " + path);
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await fd.readFile());
  } finally { await fd.close(); }
}
const empty = (): HistoryRefs => ({ base: null, draft: null, remote: null, conflict: null, strict: false, revisions: [], resolution: null, resolutionParent: null });

// Process-owned exclusive claims. A crash leaves its immutable symlink in place.
// A contender skips only a confirmed dead, still-identical claim on this host.
// Never unlink another owner's claim: two independent recoverers cannot steal a lock.
async function claimState(path: string): Promise<"active" | "missing" | "dead"> {
  let owner: string;
  try { owner = await readlink(path); } catch (e) { if (missing(e)) return "missing"; throw e; }
  const [host, pid] = owner.split(":");
  if (host === hostname() && /^\d+$/.test(pid ?? "")) {
    try { process.kill(Number(pid), 0); } catch (e) {
      if (code(e) === "ESRCH" && await readlink(path).catch(() => "") === owner) return "dead";
    }
  }
  return "active";
}

async function claim<T>(dir: string, name: string, run: () => Promise<T>): Promise<T> {
  await privateDirectory(dir);
  const owner = hostname() + ":" + process.pid + ":" + randomUUID();
  for (let n = 0; ; n++) {
    const path = join(dir, name + (n ? "." + n : ""));
    try { await symlink(owner, path); }
    catch (e) {
      if (code(e) !== "EEXIST") throw e;
      const state = await claimState(path);
      if (state !== "active") {
        if (state === "missing") n--;
        continue;
      }
      throw new Error("Another Wire operation owns this document. Retry when it finishes.");
    }
    try { return await run(); } finally { await unlink(path); }
  }
}

async function excludeClaims(dir: string, names: RegExp) {
  for (const name of await readdir(dir)) {
    if (names.test(name) && await claimState(join(dir, name)) === "active") throw new Error("Wire storage is busy. Retry the backend switch or document operation when it finishes.");
  }
}

// Each side posts its claim before inspecting the other side. An operation
// that has passed its check remains visible until its last durable write.
export async function withHistoryLock<T>(root: string, key: string, run: () => Promise<T>): Promise<T> {
  const dir = join(root, "history");
  return claim(dir, "lock-" + hash(key), async () => {
    await excludeClaims(dir, /^switch(?:\.\d+)?$/);
    return run();
  });
}

export async function withBackendSwitch<T>(root: string, run: () => Promise<T>): Promise<T> {
  const dir = join(root, "history");
  return claim(dir, "switch", async () => {
    await excludeClaims(dir, /^lock-[a-f0-9]{64}(?:\.\d+)?$/);
    return run();
  });
}

export class DocumentHistory {
  readonly dir: string;
  refs: HistoryRefs = empty();
  private constructor(root: string, private readonly id: string, private readonly now: () => Date) { this.dir = join(root, "history", hash(id)); }
  static async load(root: string, id: string, now: () => Date) {
    const history = new DocumentHistory(root, id, now);
    await privateDirectory(join(root, "history")); await privateDirectory(history.dir);
    const raw = await working(join(history.dir, "refs.json"));
    if (raw !== null) {
      history.refs = JSON.parse(raw) as HistoryRefs;
      validateRefs(history.refs);
    }
    return history;
  }
  async save() { await json(join(this.dir, "refs.json"), this.refs); }
  async revision(kind: HistoryEntry["kind"], markdown: string, parents: (string | null)[]): Promise<string> {
    plainMarkdown(markdown);
    const blob = hash(markdown), ancestry = [...new Set(parents.filter((p): p is string => p !== null))];
    const parent = ancestry.length === 1 && this.refs.revisions.find(r => r.id === ancestry[0]);
    const id = parent && parent.blob === blob ? parent.id : hash(JSON.stringify([kind, blob, ancestry]));
    const path = join(this.dir, blob + ".md");
    const stored = await working(path);
    if (stored !== markdown) {
      if (stored !== null || this.refs.revisions.some(r => r.blob === blob)) throw new Error("Corrupt Wire history snapshot: " + id);
      const tmp = join(this.dir, randomUUID());
      try { await write(tmp, markdown); await rename(tmp, path); } finally { await rm(tmp, { force: true }); }
    }
    if (!this.refs.revisions.some(r => r.id === id)) this.refs.revisions.push({ id, kind, at: this.now().toISOString(), blob, parents: ancestry });
    return id;
  }
  token(raw: string | null = null) { return hash(stableJsonCompact([this.refs, raw])); }
  view(raw: string) {
    const view = editorView(raw, this.refs.editorReceipts);
    for (const ref of [view.shown, view.base]) if (ref && !this.refs.revisions.some(r => r.id === ref)) throw new Error("Orphaned Wire editor receipt. The file was kept.");
    return view;
  }
  async text(ref: string) {
    const r = this.refs.revisions.find(r => r.id === ref);
    if (!r) throw new Error("Unknown document revision: " + ref);
    const value = await working(join(this.dir, r.blob + ".md"));
    if (value === null || hash(value) !== r.blob) throw new Error("Corrupt Wire history snapshot: " + ref);
    return value;
  }
  async log(): Promise<HistoryEntry[]> {
    // An old editor can still write through an open file descriptor after
    // publication. Only an explicit history request scans these retained inodes.
    const known = new Set(this.refs.revisions.map(r => r.blob));
    const count = this.refs.revisions.length;
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith(".old") || !transactionId.test(name.slice(0, -4))) continue;
      const path = join(this.dir, name);
      let view: ReturnType<typeof editorView>;
      try {
        const raw = await working(path);
        if (raw === null) continue;
        // A pre-enrollment displaced file has no receipt. Its parent is unknown.
        view = editorView(raw, hasEditorReceipt(raw) ? { ...this.refs.retiredEditorReceipts, ...this.refs.editorReceipts } : undefined);
        if (view.shown && !this.refs.revisions.some(r => r.id === view.shown)) throw new Error("Orphaned receipt");
      } catch (cause) {
        throw new Error("A retained editor save is unreadable. Inspect the private copy: " + path, { cause });
      }
      const blob = hash(view.markdown);
      if (!known.has(blob)) {
        await this.revision("recovered", view.markdown, [view.shown]);
        known.add(blob);
      }
    }
    if (count !== this.refs.revisions.length) await this.save();
    return this.refs.revisions.map(({ blob: _, ...entry }) => entry).reverse();
  }
  async seed(markdown: string | null) {
    if (this.refs.base === null && markdown !== null) {
      this.refs.base = this.refs.remote = await this.revision("attach", markdown, []);
      await this.save();
    }
  }
  async checkPendingDraft(view: ReturnType<typeof editorView>) {
    const shell = this.refs.editorDraft;
    if (!shell || !view.shown || !view.base || shell === view.shown || this.refs.conflict) return;
    const basis = Object.values(this.refs.editorReceipts ?? {}).find(r => r.shown === shell)?.base;
    if (!basis) throw new Error("Missing receipt for the saved shell draft. Both files were kept.");
    const editor = await this.revision("local", view.markdown, [view.shown]);
    this.refs.conflict = { editor, shell, editorBase: view.base, shellBase: basis };
    await this.save();
  }
  commonAncestor(left: string, right: string): string | null {
    const graph = new Map(this.refs.revisions.map(r => [r.id,r.parents]));
    const ancestors = (start: string) => {
      const seen = new Set<string>(), pending = [start];
      while (pending.length) {
        const id = pending.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const parent of graph.get(id) ?? []) pending.push(parent);
      }
      return seen;
    };
    const a = ancestors(left), b = ancestors(right);
    const common = new Set([...a].filter(id => b.has(id)));
    const tips = new Set(common);
    for (const id of common) for (const parent of graph.get(id)!) tips.delete(parent);
    return tips.size === 1 ? [...tips][0]! : null;
  }
  async captureLocal(markdown: string, parent = this.refs.draft ?? this.refs.base) {
    this.refs.draft = await this.revision("local", markdown, [parent]);
    await this.save();
    return this.refs.draft;
  }
  async observe(remote: FetchedDocument) {
    this.refs.remote = await this.revision("remote", remote.markdown, [this.refs.remote ?? this.refs.base]);
    return this.refs.remote;
  }
  async status(path: string): Promise<HistoryStatus> {
    const base = this.refs.base;
    const raw = await working(path);
    return { path, base, modified: base === null || raw === null || this.view(raw).markdown !== await this.text(base), conflict: this.refs.conflict };
  }
  // Private write-ahead intent spans the worktree, registry, and revision pointers.
  // Moving the actual old inode out first lets us verify what we displaced. link()
  // publishes only into a vacant name; it cannot overwrite a concurrent editor save.
  async publish(path: string, expected: string | null, next: string, refs: HistoryRefs, resource: Resource | null, put: (r: Resource) => Promise<Resource>, acknowledged = false) {
    await requireHistoryVolume(this.dir, dirname(path));
    const token = randomUUID();
    const pending: Publication = { path, expected, next, refs, resource, token, acknowledged };
    await json(join(this.dir, "pending.json"), pending);
    await this.finish(pending, put);
  }
  async detach(path: string, expected: string | null, next: string, refs: HistoryRefs, detached: Resource, remove: (r: Resource) => Promise<void>) {
    await requireHistoryVolume(this.dir, dirname(path));
    const intent: Publication = {path, expected, next, refs, detached, resource: null, token: randomUUID(), acknowledged: false};
    await json(join(this.dir, "pending.json"), intent);
    await this.finish(intent, undefined, remove);
  }
  async recover(path: string | undefined, put: (r: Resource) => Promise<Resource>, remove?: (r: Resource) => Promise<void>) {
    const file = join(this.dir, "pending.json");
    const raw = await working(file);
    if (raw === null) return;
    const pending = JSON.parse(raw) as Publication;
    if (!transactionId.test(pending.token) || typeof pending.next !== "string" || (pending.expected !== null && typeof pending.expected !== "string") || typeof pending.acknowledged !== "boolean") throw new Error("Corrupt Wire publication journal.");
    validateRefs(pending.refs);
    if (path !== undefined && resolve(path) !== pending.path) throw new Error("Wire publication pending at another path: " + pending.path);
    if (pending.detached && (pending.detached.id !== this.id || pending.resource || pending.acknowledged || !remove)) throw new Error("Corrupt Wire detach journal.");
    await this.finish(pending, put, remove);
    return pending.detached;
  }
  private async finish(p: Publication, put?: (r: Resource) => Promise<Resource>, remove?: (r: Resource) => Promise<void>) {
    const pending = join(this.dir, "pending.json"), stage = join(this.dir, p.token + ".new"), old = join(this.dir, p.token + ".old"), delivered = join(this.dir, p.token + ".ok");
    const cleanup = async () => { await unlink(pending); await syncDir(this.dir); await rm(stage, { force: true }); await rm(delivered, { force: true }); };
    const retry = async (): Promise<never> => {
      if (await exists(old)) {
        try { await link(old, p.path); } catch (e) { if (code(e) !== "EEXIST") throw e; }
        if ((await lstat(old)).isFile()) {
          const saved = await working(old).catch((e: unknown) => { if (e instanceof TypeError) return null; throw e; });
          if (saved !== null && saved !== p.expected) {
            // The displaced inode remains private even when its editor envelope
            // cannot be decoded. Never publish or put envelope bytes in history.
            let view;
            try { view = this.view(saved); } catch { /* retain raw .old */ }
            if (view) await this.captureLocal(view.markdown, view.shown ?? undefined);
          }
        }
      }
      await cleanup();
      throw new Error("Local file changed during sync: " + basename(p.path) + ". Local changes were preserved. The next sync will retry.");
    };
    // A private hard link to the displaced inode is retained, even if another
    // application still has a writable file descriptor open on it.
    if (!p.acknowledged && !await exists(delivered)) {
      let current = await working(p.path);
      if (p.expected === null && current !== null) {
        // In a recovered first attachment, only our own hard link proves delivery.
        if (!await exists(stage)) return retry();
        const staged = await stat(stage), installed = await stat(p.path);
        if (staged.dev !== installed.dev || staged.ino !== installed.ino) return retry();
      }
      if (current !== p.next) {
        if (!await exists(stage)) {
          const mode = current === null ? 0o600 : (await stat(p.path)).mode & 0o777;
          const tmp = join(this.dir, randomUUID());
          try {
            await write(tmp, p.next, mode);
            await rename(tmp, stage);
            await syncDir(this.dir);
          } finally { await rm(tmp, { force: true }); }
        } else if (await working(stage) !== p.next) {
          throw new Error("Corrupt prepared Markdown. No file was published.");
        }
        if (p.expected !== null && !await exists(old)) {
          if (current !== p.expected) return retry();
          // Keep the name-vacant interval to the displaced-file check and
          // exclusive link; no event-loop yield or fsync while the name is absent.
          try { renameSync(p.path, old); } catch (e) { if (missing(e)) return retry(); throw e; }
          if (!lstatSync(old).isFile() || !readFileSync(old).equals(Buffer.from(p.expected))) return retry();
          try { linkSync(stage, p.path); } catch (e) { if (code(e) === "EEXIST") return retry(); throw e; }
        } else {
          if (await exists(old) && await working(old) !== p.expected) return retry();
          current = await working(p.path);
          if (current !== null && current !== p.next) return retry();
          if (current === null) {
            try { await link(stage, p.path); } catch (e) { if (code(e) === "EEXIST") return retry(); throw e; }
          }
        }
      }
      await syncDir(dirname(p.path));
      await write(delivered, ""); await syncDir(this.dir);
    }
    if (p.resource) await put!(p.resource);
    this.refs = p.refs; await this.save();
    // An unregistered path can be uploaded as a new document. Make refs and
    // plain file durable before removing its registration; retain intent until
    // deletion succeeds so an interrupted detach can finish under the lock.
    if (p.detached) await remove!(p.detached);
    await cleanup();
  }
}
