import { createHash, randomUUID } from "node:crypto";
import { constants, linkSync, readFileSync, renameSync, lstatSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { link, lstat, mkdir, open, readFile, readlink, rename, rm, stat, symlink, unlink } from "node:fs/promises";
import type { FetchedDocument, Resource } from "../core/model.js";
import { stableJsonCompact } from "../core/json.js";

export type HistoryEntry = { id: string; parents: string[]; kind: "attach" | "local" | "remote" | "merge" | "resolve"; at: string };
export type HistoryConflict = { base: string; local: string; remote: string };
export type HistoryStatus = { path: string; base: string | null; modified: boolean; conflict: HistoryConflict | null };
export type HistoryDiff = { from: string; to: string; before: string; after: string; token: string };
type Revision = HistoryEntry & { blob: string };
export type HistoryRefs = {
  base: string | null; draft: string | null; remote: string | null; conflict: HistoryConflict | null;
  strict: boolean; revisions: Revision[]; resolution: FetchedDocument | null; resolutionParent: string | null;
};
type Publication = { acknowledged: boolean; path: string; expected: string | null; next: string; token: string; refs: HistoryRefs; resource: Resource | null };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const code = (error: unknown) => (error as NodeJS.ErrnoException).code;
const missing = (error: unknown) => code(error) === "ENOENT";
async function exists(path: string) { return lstat(path).then(() => true, e => { if (missing(e)) return false; throw e; }); }
async function privateDirectory(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (e) { if (code(e) !== "EEXIST") throw e; }
  const info = await lstat(path);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error('Unsafe Wire history directory: ' + path);
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
export async function withHistoryLock<T>(root: string, key: string, run: () => Promise<T>): Promise<T> {
  const dir = join(root, "history");
  await privateDirectory(dir);
  const own = hostname() + ":" + process.pid + ":" + randomUUID();
  const lock = join(dir, "lock-" + hash(key));
  for (let n = 0; ; n++) {
    const path = lock + (n ? "." + n : "");
    try { await symlink(own, path); }
    catch (e) {
      if (code(e) !== "EEXIST") throw e;
      let owner: string;
      try { owner = await readlink(path); } catch (r) { if (missing(r)) { n--; continue; } throw r; }
      const [host, pid] = owner.split(":");
      if (host === hostname() && /^\d+$/.test(pid ?? "")) {
        try { process.kill(Number(pid), 0); } catch (k) {
          if (code(k) === "ESRCH") {
            if (await readlink(path).catch(() => "") === owner) continue;
            n--; continue;
          }
        }
      }
      throw new Error("Another Wire operation owns this document. Retry when it finishes.");
    }
    try { return await run(); } finally { await unlink(path); }
  }
}

export class DocumentHistory {
  readonly dir: string;
  refs: HistoryRefs = empty();
  private constructor(root: string, id: string, private readonly now: () => Date) { this.dir = join(root, "history", hash(id)); }
  static async load(root: string, id: string, now: () => Date) {
    const history = new DocumentHistory(root, id, now);
    await privateDirectory(join(root, "history")); await privateDirectory(history.dir);
    try { history.refs = JSON.parse(await readFile(join(history.dir, "refs.json"), "utf8")) as HistoryRefs; }
    catch (e) { if (!missing(e)) throw e; }
    return history;
  }
  async save() { await json(join(this.dir, "refs.json"), this.refs); }
  async revision(kind: HistoryEntry["kind"], markdown: string, parents: (string | null)[]): Promise<string> {
    const blob = hash(markdown), ancestry = [...new Set(parents.filter((p): p is string => p !== null))];
    if (ancestry.length === 1 && this.refs.revisions.find(r => r.id === ancestry[0])?.blob === blob) return ancestry[0]!;
    const id = hash(JSON.stringify([kind, blob, ancestry]));
    if (!this.refs.revisions.some(r => r.id === id)) {
      const path = join(this.dir, blob + ".md");
      if (!await exists(path)) {
        const tmp = join(this.dir, randomUUID());
        try { await write(tmp, markdown); await rename(tmp, path); } finally { await rm(tmp, { force: true }); }
      }
      this.refs.revisions.push({ id, kind, at: this.now().toISOString(), blob, parents: ancestry });
    }
    return id;
  }
  token() { return hash(stableJsonCompact(this.refs)); }
  async text(ref: string) {
    const r = this.refs.revisions.find(r => r.id === ref);
    if (!r) throw new Error("Unknown document revision: " + ref);
    const value = await readFile(join(this.dir, r.blob + ".md"), "utf8");
    if (hash(value) !== r.blob) throw new Error("Corrupt Wire history snapshot: " + ref);
    return value;
  }
  async seed(markdown: string | null) {
    if (this.refs.base === null && markdown !== null) {
      this.refs.base = this.refs.remote = await this.revision("attach", markdown, []);
      await this.save();
    }
  }
  async captureLocal(markdown: string) {
    this.refs.draft = await this.revision("local", markdown, [this.refs.draft ?? this.refs.base]);
    await this.save();
    return this.refs.draft;
  }
  async observe(remote: FetchedDocument) {
    this.refs.remote = await this.revision("remote", remote.markdown, [this.refs.remote ?? this.refs.base]);
    return this.refs.remote;
  }
  async status(path: string): Promise<HistoryStatus> {
    const base = this.refs.base;
    return { path, base, modified: base === null || await working(path) !== await this.text(base), conflict: this.refs.conflict };
  }
  // Private write-ahead intent spans the worktree, registry, and revision pointers.
  // Moving the actual old inode out first lets us verify what we displaced. link()
  // publishes only into a vacant name; it cannot overwrite a concurrent editor save.
  async publish(path: string, expected: string | null, next: string, refs: HistoryRefs, resource: Resource | null, put: (r: Resource) => Promise<Resource>, acknowledged = false) {
    const token = randomUUID();
    const pending: Publication = { path, expected, next, refs, resource, token, acknowledged };
    await json(join(this.dir, "pending.json"), pending);
    await this.finish(pending, put);
  }
  async recover(path: string | undefined, put: (r: Resource) => Promise<Resource>) {
    const file = join(this.dir, "pending.json");
    let pending: Publication;
    try { pending = JSON.parse(await readFile(file, "utf8")) as Publication; } catch (e) { if (missing(e)) return; throw e; }
    if (path !== undefined && resolve(path) !== pending.path) throw new Error("Wire publication pending at another path: " + pending.path);
    await this.finish(pending, put);
  }
  private async finish(p: Publication, put: (r: Resource) => Promise<Resource>) {
    const pending = join(this.dir, "pending.json"), stage = join(this.dir, p.token + ".new"), old = join(this.dir, p.token + ".old"), delivered = join(this.dir, p.token + ".ok");
    const cleanup = async () => { await unlink(pending); await syncDir(this.dir); await rm(stage, { force: true }); await rm(delivered, { force: true }); };
    const retry = async (): Promise<never> => {
      if (await exists(old)) {
        try { await link(old, p.path); } catch (e) { if (code(e) !== "EEXIST") throw e; }
        if ((await lstat(old)).isFile()) {
          const saved = await working(old).catch((e: unknown) => { if (e instanceof TypeError) return null; throw e; });
          if (saved !== null && saved !== p.expected) await this.captureLocal(saved);
        }
      }
      await cleanup();
      throw new Error("Local file changed during sync: " + basename(p.path) + ". Local changes were preserved. Run wire sync again.");
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
          await write(stage, p.next, mode);
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
    if (p.resource) await put(p.resource);
    this.refs = p.refs; await this.save(); await cleanup();
  }
}
