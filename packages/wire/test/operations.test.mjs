import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

import {
  composeWire,
  configuredWireRoot,
  defineService,
  defineServiceCatalog,
  initializeWire,
  loadWireConfig,
  openWireRegistry,
  wireRelativePath,
} from "../dist/index.js";

const testRoot = join(realpathSync(tmpdir()), "wire-ts-operations");

before(async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
});

after(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

function filesystem() {
  return {
    exists: async (path) => access(path).then(() => true, () => false),
    isFile: async (path) => stat(path).then((value) => value.isFile(), () => false),
    readText: (path) => readFile(path, "utf8"),
    writeText: async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents); },
    remove: (path) => unlink(path),
  };
}

const workspace = {
  configuredRoot: configuredWireRoot,
  initialize: initializeWire,
  loadConfig: loadWireConfig,
  openRegistry: openWireRegistry,
  relativePath: wireRelativePath,
};

function watchHarness() {
  const fileWatchers = [];
  const intervals = [];
  return {
    fileWatchers,
    intervals,
    capability: {
      watchFile: (path, onChange) => {
        const watcher = { path, onChange, closed: false };
        fileWatchers.push(watcher);
        return { close: () => { watcher.closed = true; } };
      },
      every: (milliseconds, onTick) => {
        const interval = { milliseconds, onTick, closed: false };
        intervals.push(interval);
        return { close: () => { interval.closed = true; } };
      },
    },
    triggerFile: async (path) => {
      for (const watcher of fileWatchers.filter((item) => item.path === path && !item.closed)) await watcher.onChange();
    },
    tick: async () => {
      for (const interval of intervals.filter((item) => !item.closed)) await interval.onTick();
    },
  };
}

async function waitUntil(predicate) {
  const deadline = Date.now() + 1000;
  while (!await predicate() && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  assert.equal(await predicate(), true);
}

function catalog(fetches, upload) {
  return defineServiceCatalog([
    defineService({
      name: "notion",
      matches: (url) => url.hostname === "notion.test",
      parse: (url) => ({ service: "notion", identifier: url.pathname.slice(1), type: "document" }),
      fetch: async (_input, url, source) => fetches(url, source),
      ...(upload === undefined ? {} : { upload: async (_input, markdown, markdownPath) => upload(markdown, markdownPath) }),
    }),
    defineService({
      name: "slack",
      matches: (url) => url.hostname === "slack.test",
      parse: (url) => ({ service: "slack", identifier: url.pathname.slice(1), type: "message-thread" }),
      fetch: async (_input, url, source) => fetches(url, source),
    }),
  ]);
}

function createWire(home, fetches, opened = [], upload) {
  return composeWire({
    home,
    fetchInput: {},
    catalog: catalog(fetches, upload),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async (path) => { opened.push(path); },
  });
}

function createSynchronizingWire(home, synchronize, watch) {
  return composeWire({
    home,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => ({ title: "Project", markdown: "# Remote\n", data: { revision: 1 } }),
      synchronize: async (_input, url, source, base, markdown, markdownPath) => synchronize(url, source, base, markdown, markdownPath),
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    ...(watch === undefined ? {} : { watch }),
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
}

for (const backend of ["sqlite", "files"]) {
  test(`${backend} create and repeated sync preserve location and link data`, async () => {
    const project = join(testRoot, `${backend}-resync`);
    await mkdir(join(project, "docs"), { recursive: true });
    await initializeWire(project, backend, backend === "sqlite" ? "registry.sqlite3" : "records");
    let revision = 0;
    const wire = createWire(project, async () => {
      revision += 1;
      return { title: revision === 1 ? "Original" : "Renamed", markdown: `# Revision ${revision}\n`, data: { revision } };
    });
    const first = await wire.create("https://notion.test/page", join(project, "docs"));
    const registry = await openWireRegistry(project, project);
    await registry.put({
      ...first.resource,
      filesystem_links: [
        { path: "docs/original.md", role: "primary", data: { format: "markdown", custom: true } },
        { path: "docs/assets/image.png", role: "asset", data: { sha256: "abc" } },
      ],
      relationships: [{ target_id: "old", type: "references", data: { url: "https://notion.test/old" } }],
    });
    const second = await wire.sync(first.path, project);
    assert.equal(second.path, first.path);
    assert.equal(await readFile(first.path, "utf8"), "# Revision 2\n");
    assert.deepEqual(second.resource.filesystem_links, [
      { path: "docs/assets/image.png", role: "asset", data: { sha256: "abc" } },
      { path: "docs/original.md", role: "primary", data: { custom: true, format: "markdown" } },
    ]);
    assert.deepEqual(second.resource.relationships, []);
    assert.deepEqual(second.resource.data, [
      { namespace: "notion", key: "snapshot", value: { revision: 2 } },
      { namespace: "wire", key: "synced_at", value: "2026-06-10T12:00:00.000Z" },
      { namespace: "wire", key: "title", value: "Renamed" },
    ]);
    assert.equal((await wire.listResources(project)).length, 1);
  });
}

test("view returns fetched document without writes or registry mutation", async () => {
  const project = join(testRoot, "view-purity");
  await mkdir(project);
  const wire = createWire(project, async () => ({ title: "Viewed", markdown: "# Viewed\n", data: { viewed: true } }));
  assert.deepEqual(await wire.view("https://notion.test/page"), { title: "Viewed", markdown: "# Viewed\n", data: { viewed: true } });
  assert.equal(await filesystem().exists(join(project, ".wire")), false);
  assert.deepEqual(await import("node:fs/promises").then(({ readdir }) => readdir(project)), []);
});

test("registered-resource operations require an initialized workspace without creating one", async () => {
  for (const [name, operation] of [
    ["sync", (wire, project) => wire.sync("missing.md", project)],
    ["download", (wire, project) => wire.download("missing.md", project)],
    ["watch", (wire, project) => wire.watch("missing.md", project)],
    ["open", (wire, project) => wire.openResource("missing.md", project)],
    ["sync-all", (wire, project) => wire.syncAll(project)],
    ["list", (wire, project) => wire.listResources(project)],
    ["show", (wire, project) => wire.showResource("missing.md", project)],
  ]) {
    const project = join(testRoot, `missing-workspace-${name}`);
    await mkdir(project);
    const wire = createWire(project, async () => ({ title: "unused", markdown: "", data: {} }));
    await assert.rejects(() => operation(wire, project), /Wire workspace not initialized\. Run `wire init` or `wire <url>` first\./);
    assert.equal(await filesystem().exists(join(project, ".wire")), false);
  }
});

test("sync uploads existing unregistered markdown as new Notion document", async () => {
  const project = join(testRoot, "sync-upload-local");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const markdownPath = join(project, "questions_grouped.md");
  await writeFile(markdownPath, "# Questions\n\nBody\n");
  const uploads = [];
  const wire = createWire(
    project,
    async () => ({ title: "unused", markdown: "", data: {} }),
    [],
    async (markdown, path) => {
      uploads.push({ markdown, path });
      return { url: "https://notion.test/uploaded", title: "Questions", markdown: "# Questions\n\nBody\n", data: { page_id: "uploaded", markdown: "# Questions\n\nBody\n" } };
    },
  );
  const result = await wire.sync(markdownPath, project);
  assert.deepEqual(uploads, [{ markdown: "# Questions\n\nBody\n", path: markdownPath }]);
  assert.equal(result.path, markdownPath);
  assert.equal(result.resource.id, "notion:uploaded");
  assert.equal(result.resource.urls[0], "https://notion.test/uploaded");
  assert.equal(await readFile(markdownPath, "utf8"), "# Questions\n\nBody\n");
  assert.deepEqual(result.summary, { action: "uploaded", added: 0, modified: 0, removed: 0, remote: "https://notion.test/uploaded", local: markdownPath });
});

test("create extracts supported relationships and returns JSON-shaped data", async () => {
  const project = join(testRoot, "relationships");
  await mkdir(project);
  const wire = createWire(project, async () => ({
    title: "Links",
    markdown: "https://slack.test/thread https://notion.test/page https://example.com/ignored https://slack.test/thread.",
    data: { blocks: [1, 2] },
  }));
  const result = await wire.create("https://notion.test/page", project);
  assert.deepEqual(result.resource.relationships, [{ target_id: "slack:thread", type: "references", data: { url: "https://slack.test/thread" } }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(result.markdown, await readFile(result.path, "utf8"));
  assert.deepEqual(result.summary, { action: "created", added: 1, modified: 0, removed: 0, remote: "https://notion.test/page", local: result.path });
  const repeated = await wire.create("https://notion.test/page", project);
  assert.equal(repeated.path, result.path);
  assert.deepEqual(repeated.summary, { action: "synced", added: 0, modified: 0, removed: 0, remote: "https://notion.test/page", local: result.path });
});

test("create keeps clean titles and adds stable identity only on filename collision", async () => {
  const project = join(testRoot, "filename-collision");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createWire(project, async () => ({ title: "Weekly Sync", markdown: "# Weekly Sync\n", data: {} }));
  const first = await wire.create("https://notion.test/one", project);
  const second = await wire.create("https://notion.test/two", project);
  const longIdentifier = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-extra";
  const third = await wire.create(`https://notion.test/${longIdentifier}`, project);
  const suffix = `notion-${longIdentifier}`;
  const compact = `${suffix.slice(0, 32)}-${createHash("sha256").update(suffix).digest("hex").slice(0, 10)}`;
  assert.equal(first.path, join(project, "weekly-sync.md"));
  assert.equal(second.path, join(project, "weekly-sync-notion-two.md"));
  assert.equal(third.path, join(project, `weekly-sync-${compact}.md`));
});

test("sync-all preserves registered subdirectories", async () => {
  const project = join(testRoot, "sync-all");
  await mkdir(join(project, "one"), { recursive: true });
  await mkdir(join(project, "two", "nested"), { recursive: true });
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createWire(project, async (url) => ({ title: url.endsWith("one") ? "One" : "Two", markdown: `# ${url}\n`, data: {} }));
  await wire.create("https://notion.test/one", join(project, "one"));
  await wire.create("https://notion.test/two", join(project, "two", "nested"));
  const results = await wire.syncAll(project);
  assert.deepEqual(results.map((result) => result.path), [join(project, "one", "one.md"), join(project, "two", "nested", "two.md")]);
});

test("sync-all launched from a subdirectory syncs only resources inside that tree", async () => {
  const project = join(testRoot, "sync-all-scoped");
  await mkdir(join(project, "one"), { recursive: true });
  await mkdir(join(project, "two", "nested"), { recursive: true });
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createWire(project, async (url) => ({ title: url.endsWith("one") ? "One" : "Two", markdown: `# ${url}\n`, data: {} }));
  await wire.create("https://notion.test/one", join(project, "one"));
  await wire.create("https://notion.test/two", join(project, "two", "nested"));
  const oneResults = await wire.syncAll(join(project, "one"));
  assert.deepEqual(oneResults.map((result) => result.path), [join(project, "one", "one.md")]);
  const twoResults = await wire.syncAll(join(project, "two"));
  assert.deepEqual(twoResults.map((result) => result.path), [join(project, "two", "nested", "two.md")]);
});

test("sync-all scopes symlinked launch directories to matching workspace resources", async () => {
  const realProject = join(testRoot, "sync-all-realpath");
  const linkedProject = join(testRoot, "sync-all-link");
  await mkdir(join(realProject, "one"), { recursive: true });
  await mkdir(join(realProject, "two"), { recursive: true });
  await symlink(realProject, linkedProject, "dir");
  await initializeWire(realProject, "sqlite", "registry.sqlite3");
  const wire = createWire(realProject, async (url) => ({ title: url.endsWith("one") ? "One" : "Two", markdown: `# ${url}\n`, data: {} }));
  await wire.create("https://notion.test/one", join(realProject, "one"));
  await wire.create("https://notion.test/two", join(realProject, "two"));
  const results = await wire.syncAll(join(linkedProject, "one"));
  assert.deepEqual(results.map((result) => result.path), [join(realProject, "one", "one.md")]);
});

test("sync passes stored snapshot and edited Markdown into service synchronization", async () => {
  const project = join(testRoot, "service-synchronize");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const calls = [];
  const wire = createSynchronizingWire(project, async (url, source, base, markdown, markdownPath) => {
    calls.push({ url, source, base, markdown, markdownPath });
    return { title: "Project", markdown: "# Merged\n", data: { revision: 2 } };
  });
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "# Local edit\n");
  const synced = await wire.sync(created.path, project);
  assert.deepEqual(calls, [{ url: "https://sync.test/project", source: { service: "sync", identifier: "project", type: "project" }, base: { revision: 1 }, markdown: "# Local edit\n", markdownPath: created.path }]);
  assert.equal(await readFile(created.path, "utf8"), "# Merged\n");
  assert.deepEqual(synced.resource.data.find((item) => item.namespace === "sync" && item.key === "snapshot").value, { revision: 2 });
  assert.deepEqual(synced.summary, { action: "downloaded", added: 0, modified: 1, removed: 0, remote: "https://sync.test/project", local: created.path });
});

test("sync summary counts same-line replacements as modified", async () => {
  const project = join(testRoot, "modified-summary");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createSynchronizingWire(project, async () => ({ title: "Project", markdown: "| id | new |\n", data: { revision: 2 } }));
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "| id | old |\n");
  const synced = await wire.sync(created.path, project);
  assert.deepEqual(synced.summary, { action: "downloaded", added: 0, modified: 1, removed: 0, remote: "https://sync.test/project", local: created.path });
});

test("sync marks registered snapshot edits as uploaded and summarizes the base-to-upload diff", async () => {
  const project = join(testRoot, "uploaded-summary");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => ({ title: "Project", markdown: "# Remote\n", data: { revision: 1, markdown: "# Remote\n" } }),
      synchronize: async (_input, _url, _source, _base, markdown) => ({ title: "Project", markdown, data: { revision: 2, markdown } }),
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "# Local edit\n");
  const synced = await wire.sync(created.path, project);
  assert.deepEqual(synced.summary, { action: "uploaded", added: 0, modified: 1, removed: 0, remote: "https://sync.test/project", local: created.path });
});

test("sync upload summary ignores provider Markdown canonicalization", async () => {
  const project = join(testRoot, "uploaded-summary-canonicalized");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => ({ title: "Project", markdown: "A\nB\n", data: { revision: 1, markdown: "A\nB\n" } }),
      synchronize: async (_input, _url, _source, _base, markdown) => ({ title: "Project", markdown: markdown.replace("B\n", "B normalized\n"), data: { revision: 2, markdown: markdown.replace("B\n", "B normalized\n") } }),
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "A\nB\nC\n");
  const synced = await wire.sync(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "A\nB normalized\nC\n");
  assert.deepEqual(synced.summary, { action: "uploaded", added: 1, modified: 0, removed: 0, remote: "https://sync.test/project", local: created.path });
});

test("sync marks local Markdown-only canonicalization as synced", async () => {
  const project = join(testRoot, "canonicalized-summary");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => ({ title: "Project", markdown: "| id | value |\n| --- | --- |\n| 1 | old |\n", data: { revision: 1, markdown: "| id | value |\n| --- | --- |\n| 1 | old |\n" } }),
      synchronize: async () => ({ title: "Project", markdown: "| id | value |\n| --- | --- |\n| 1 | old |\n", data: { revision: 1, markdown: "| id | value |\n| --- | --- |\n| 1 | old |\n" } }),
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "| id | value |\n| :--- | ---: |\n| 1 | old |\n");
  const synced = await wire.sync(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "| id | value |\n| --- | --- |\n| 1 | old |\n");
  assert.deepEqual(synced.summary, { action: "synced", added: 0, modified: 1, removed: 0, remote: "https://sync.test/project", local: created.path });
});

test("download returns the same compact summary shape as sync", async () => {
  const project = join(testRoot, "download-summary");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  let revision = 0;
  const wire = createWire(project, async () => {
    revision += 1;
    return { title: "Document", markdown: `# Remote ${revision}\n`, data: { revision } };
  });
  const created = await wire.create("https://notion.test/page", project);
  await writeFile(created.path, "# Local edit\n");
  const downloaded = await wire.download(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "# Remote 2\n");
  assert.deepEqual(downloaded.summary, { action: "downloaded", added: 0, modified: 1, removed: 0, remote: "https://notion.test/page", local: created.path });
});

test("download reports downloaded when local Markdown already matches remote", async () => {
  const project = join(testRoot, "download-noop-summary");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createWire(project, async () => ({ title: "Document", markdown: "# Remote\n", data: {} }));
  const created = await wire.create("https://notion.test/page", project);
  const downloaded = await wire.download(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "# Remote\n");
  assert.deepEqual(downloaded.summary, { action: "downloaded", added: 0, modified: 0, removed: 0, remote: "https://notion.test/page", local: created.path });
});

test("unlink downloads latest Markdown and removes the resource from future syncs", async () => {
  const project = join(testRoot, "unlink-download-remove");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  let revision = 0;
  const wire = createWire(project, async () => {
    revision += 1;
    return { title: "Document", markdown: `# Remote ${revision}\n`, data: { revision } };
  });
  const created = await wire.create("https://notion.test/page", project);
  await writeFile(created.path, "# Local edit\n");
  const unlinked = await wire.unlink(created.path, project);
  const registry = await openWireRegistry(project, project);
  assert.equal(await readFile(created.path, "utf8"), "# Remote 2\n");
  assert.deepEqual(await registry.listResources(), []);
  assert.deepEqual(unlinked.summary, { action: "unlinked", added: 0, modified: 1, removed: 0, remote: "https://notion.test/page", local: created.path });
  await assert.rejects(() => wire.sync("notion:page", project), /Resource not found: notion:page/);
  assert.deepEqual(await wire.syncAll(project), []);
});

test("sync absolute file uses its workspace registry", async () => {
  const project = join(testRoot, "absolute-path-project");
  const elsewhere = join(testRoot, "absolute-path-elsewhere");
  await mkdir(project);
  await mkdir(elsewhere);
  const wire = createWire(elsewhere, async () => ({ title: "Document", markdown: "# Document\n", data: {} }));
  const created = await wire.create("https://notion.test/page", project);
  const synced = await wire.sync(created.path, elsewhere);
  assert.equal(synced.resource.id, "notion:page");
  assert.equal(synced.path, created.path);
});

test("open and show absolute files use their workspace registry", async () => {
  const project = join(testRoot, "absolute-open-project");
  const elsewhere = join(testRoot, "absolute-open-elsewhere");
  await mkdir(project);
  await mkdir(elsewhere);
  const opened = [];
  const wire = createWire(elsewhere, async () => ({ title: "Document", markdown: "# Document\n", data: {} }), opened);
  const created = await wire.create("https://notion.test/page", project);
  assert.equal((await wire.showResource(created.path, elsewhere)).id, "notion:page");
  assert.equal((await wire.openResource(created.path, elsewhere)).id, "notion:page");
  assert.deepEqual(opened, ["https://notion.test/page"]);
});

test("sync relative file resolves from the launch directory", async () => {
  const project = join(testRoot, "relative-path-project");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createWire(project, async () => ({ title: "Document", markdown: "# Document\n", data: {} }));
  const created = await wire.create("https://notion.test/page", project);
  const registry = await openWireRegistry(project, project);
  assert.equal((await registry.findByPath(wireRelativePath(created.path, join(project, ".wire"))))[0].id, "notion:page");
  const synced = await wire.sync("document.md", project);
  assert.equal(synced.resource.id, "notion:page");
  assert.equal(synced.path, created.path);
});

test("sync recreates deleted registered Markdown files by path", async () => {
  for (const backend of ["sqlite", "files"]) {
    const project = join(testRoot, `deleted-path-${backend}`);
    await mkdir(project);
    await initializeWire(project, backend, backend === "sqlite" ? "registry.sqlite3" : "records");
    let revision = 0;
    const wire = createWire(project, async () => {
      revision += 1;
      return { title: "Document", markdown: `# Revision ${revision}\n`, data: { revision } };
    });
    const created = await wire.create("https://notion.test/page", project);
    await unlink(created.path);
    const synced = await wire.sync("document.md", project);
    assert.equal(synced.path, created.path);
    assert.equal(await readFile(created.path, "utf8"), "# Revision 2\n");
  }
});

test("sync preserves service metadata written during synchronization", async () => {
  const project = join(testRoot, "sync-service-metadata");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createSynchronizingWire(project, async (_url, source, _base, markdown, markdownPath) => {
    const registry = await openWireRegistry(project, project);
    const resource = await registry.findByIdentifier(source.service, source.identifier);
    await registry.put({ ...resource, data: [...resource.data, { namespace: "sync", key: "sidecar", value: { blocks: [] } }] });
    return { title: "Project", markdown, data: { revision: 2, path: markdownPath } };
  });
  const created = await wire.create("https://sync.test/project", project);
  const synced = await wire.sync(created.path, project);
  assert.deepEqual(synced.resource.data.find((item) => item.namespace === "sync" && item.key === "sidecar").value, { blocks: [] });
});

test("sync conflict leaves edited Markdown and stored snapshot unchanged", async () => {
  const project = join(testRoot, "service-conflict");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const wire = createSynchronizingWire(project, async () => { throw new Error("Conflicting edits"); });
  const created = await wire.create("https://sync.test/project", project);
  await writeFile(created.path, "# Local edit\n");
  await assert.rejects(() => wire.sync(created.path, project), /Conflicting edits/);
  assert.equal(await readFile(created.path, "utf8"), "# Local edit\n");
  const stored = await wire.showResource(created.path, project);
  assert.deepEqual(stored.data.find((item) => item.namespace === "sync" && item.key === "snapshot").value, { revision: 1 });
});

test("sync-all invokes service synchronization for every registered resource", async () => {
  const project = join(testRoot, "service-sync-all");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  let calls = 0;
  const wire = createSynchronizingWire(project, async (_url, _source, base) => {
    calls += 1;
    return { title: "Project", markdown: `# Merged ${calls}\n`, data: { revision: base.revision + 1 } };
  });
  await wire.create("https://sync.test/one", project);
  await wire.create("https://sync.test/two", project);
  assert.deepEqual((await wire.listResources(project)).map((resource) => ({ id: resource.id, urls: resource.urls })), [
    { id: "sync:one", urls: ["https://sync.test/one"] },
    { id: "sync:two", urls: ["https://sync.test/two"] },
  ]);
  const results = await wire.syncAll(project);
  assert.equal(calls, 2);
  assert.deepEqual(results.map((result) => result.markdown), ["# Merged 1\n", "# Merged 2\n"]);
  assert.deepEqual(results.map((result) => result.summary), [
    { action: "downloaded", added: 0, modified: 1, removed: 0, remote: "https://sync.test/one", local: join(project, "project.md") },
    { action: "downloaded", added: 0, modified: 1, removed: 0, remote: "https://sync.test/two", local: join(project, "project-sync-two.md") },
  ]);
});

test("sync-all records resource failures and continues syncing remaining resources", async () => {
  const project = join(testRoot, "service-sync-all-failures");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const calls = [];
  const wire = createSynchronizingWire(project, async (url, _source, base) => {
    calls.push(url);
    if (url.endsWith("/one")) throw new Error("Remote document disappeared");
    return { title: "Project", markdown: `# Merged ${base.revision + 1}\n`, data: { revision: base.revision + 1 } };
  });
  await wire.create("https://sync.test/one", project);
  await wire.create("https://sync.test/two", project);
  const results = await wire.syncAll(project);
  assert.deepEqual(calls, ["https://sync.test/one", "https://sync.test/two"]);
  assert.deepEqual(results.map((result) => result.summary.action), ["failed", "downloaded"]);
  assert.equal(results[0].resource.id, "sync:one");
  assert.equal(results[0].summary.error, "Remote document disappeared");
  assert.equal(results[1].resource.id, "sync:two");
  assert.equal(await readFile(join(project, "project-sync-two.md"), "utf8"), "# Merged 2\n");
});

test("sync-all records object-shaped resource failures readably", async () => {
  const project = join(testRoot, "service-sync-all-object-failures");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  const calls = [];
  const wire = createSynchronizingWire(project, async (url, _source, base) => {
    calls.push(url);
    if (url.endsWith("/one")) throw { message: "Remote document disappeared" };
    if (url.endsWith("/two")) throw { error: "Remote returned malformed payload" };
    return { title: "Project", markdown: `# Merged ${base.revision + 1}\n`, data: { revision: base.revision + 1 } };
  });
  await wire.create("https://sync.test/one", project);
  await wire.create("https://sync.test/two", project);
  await wire.create("https://sync.test/three", project);
  const results = await wire.syncAll(project);
  assert.deepEqual(calls, ["https://sync.test/one", "https://sync.test/three", "https://sync.test/two"]);
  assert.deepEqual(results.map((result) => result.summary.action), ["failed", "downloaded", "failed"]);
  assert.equal(results[0].summary.error, "Remote document disappeared");
  assert.equal(results[2].summary.error, "{\"error\":\"Remote returned malformed payload\"}");
  assert.doesNotMatch(results[0].summary.error, /\[object Object\]/);
  assert.doesNotMatch(results[2].summary.error, /\[object Object\]/);
  assert.equal(await readFile(join(project, "project-sync-three.md"), "utf8"), "# Merged 2\n");
});

test("watch two-way syncs debounced file changes and polls", async () => {
  const project = join(testRoot, "watch-two-way");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, ".wire", "config.json"), `${JSON.stringify({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "two-way", debounceMs: 5, pollMs: 20 } }, null, 2)}\n`);
  const calls = [];
  const harness = watchHarness();
  const wire = createSynchronizingWire(project, async (_url, _source, base, markdown, markdownPath) => {
    calls.push({ base, markdown, markdownPath });
    return { title: "Project", markdown: `# Merged ${calls.length}\n`, data: { revision: base.revision + 1 } };
  }, harness.capability);
  const created = await wire.create("https://sync.test/project", project);
  const session = await wire.watch(created.path, project);
  assert.equal(session.path, created.path);
  assert.equal(session.mode, "two-way");
  assert.equal(session.debounceMs, 5);
  assert.equal(session.pollMs, 20);
  assert.deepEqual(harness.fileWatchers.map((watcher) => watcher.path), [created.path]);
  assert.deepEqual(harness.intervals.map((interval) => interval.milliseconds), [20]);
  await writeFile(created.path, "# Local edit\n");
  await harness.triggerFile(created.path);
  await waitUntil(() => calls.length === 1);
  assert.deepEqual(calls[0], { base: { revision: 1 }, markdown: "# Local edit\n", markdownPath: created.path });
  await waitUntil(async () => await readFile(created.path, "utf8") === "# Merged 1\n");
  await harness.triggerFile(created.path);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  assert.equal(calls.length, 1);
  await harness.tick();
  await waitUntil(() => calls.length === 2);
  await waitUntil(async () => await readFile(created.path, "utf8") === "# Merged 2\n");
  session.close();
  await session.closed;
  assert.deepEqual(harness.fileWatchers.map((watcher) => watcher.closed), [true]);
  assert.deepEqual(harness.intervals.map((interval) => interval.closed), [true]);
});

test("watch recreates deleted registered Markdown before watching", async () => {
  const project = join(testRoot, "watch-missing-file");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, ".wire", "config.json"), `${JSON.stringify({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "two-way", debounceMs: 5, pollMs: 20 } }, null, 2)}\n`);
  const harness = watchHarness();
  let revision = 0;
  let synchronized = false;
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => {
        revision += 1;
        return { title: "Project", markdown: `# Remote ${revision}\n`, data: { revision } };
      },
      synchronize: async () => {
        synchronized = true;
        return { title: "Project", markdown: "# Wrong\n", data: {} };
      },
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    watch: harness.capability,
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  await unlink(created.path);
  const session = await wire.watch(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "# Remote 2\n");
  assert.equal(synchronized, false);
  assert.deepEqual(harness.fileWatchers.map((watcher) => watcher.path), [created.path]);
  session.close();
  await session.closed;
});

test("watch download mode uses polling without local file watchers", async () => {
  const project = join(testRoot, "watch-download");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, ".wire", "config.json"), `${JSON.stringify({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "download", debounceMs: 5, pollMs: 10 } }, null, 2)}\n`);
  let revision = 0;
  let synchronized = false;
  const harness = watchHarness();
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => {
        revision += 1;
        return { title: "Project", markdown: `# Remote ${revision}\n`, data: { revision } };
      },
      synchronize: async () => {
        synchronized = true;
        return { title: "Project", markdown: "# Wrong\n", data: {} };
      },
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    watch: harness.capability,
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  const session = await wire.watch(created.path, project);
  assert.equal(session.mode, "download");
  assert.deepEqual(harness.fileWatchers, []);
  assert.deepEqual(harness.intervals.map((interval) => interval.milliseconds), [10]);
  await writeFile(created.path, "# Local edit\n");
  await harness.tick();
  await waitUntil(() => revision === 2);
  assert.equal(await readFile(created.path, "utf8"), "# Remote 2\n");
  assert.equal(synchronized, false);
  session.close();
  await session.closed;
});

test("watch download mode recreates deleted registered Markdown without synchronization", async () => {
  const project = join(testRoot, "watch-download-missing-file");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, ".wire", "config.json"), `${JSON.stringify({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "download", debounceMs: 5, pollMs: 10 } }, null, 2)}\n`);
  let revision = 0;
  let synchronized = false;
  const harness = watchHarness();
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([defineService({
      name: "sync",
      matches: (url) => url.hostname === "sync.test",
      parse: (url) => ({ service: "sync", identifier: url.pathname.slice(1), type: "project" }),
      fetch: async () => {
        revision += 1;
        return { title: "Project", markdown: `# Remote ${revision}\n`, data: { revision } };
      },
      synchronize: async () => {
        synchronized = true;
        return { title: "Project", markdown: "# Wrong\n", data: {} };
      },
    })]),
    filesystem: filesystem(),
    workspace,
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    watch: harness.capability,
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    open: async () => {},
  });
  const created = await wire.create("https://sync.test/project", project);
  await unlink(created.path);
  const session = await wire.watch(created.path, project);
  assert.equal(await readFile(created.path, "utf8"), "# Remote 2\n");
  assert.equal(synchronized, false);
  assert.deepEqual(harness.fileWatchers, []);
  session.close();
  await session.closed;
});

test("moving a workspace preserves registry and document resolution", async () => {
  for (const backend of ["sqlite", "files"]) {
    const original = join(testRoot, `portable-${backend}-original`);
    const moved = join(testRoot, `portable-${backend}-moved`);
    await mkdir(join(original, "docs"), { recursive: true });
    await initializeWire(original, backend, backend === "sqlite" ? "registry.sqlite3" : "records");
    let revision = 0;
    const fetches = async () => {
      revision += 1;
      return { title: "Portable", markdown: `# Revision ${revision}\n`, data: { revision } };
    };
    const originalWire = createWire(original, fetches);
    const created = await originalWire.create("https://notion.test/portable", join(original, "docs"));
    assert.deepEqual(created.resource.filesystem_links, [{ path: "docs/portable.md", role: "primary", data: { format: "markdown" } }]);
    await rename(original, moved);
    const opened = [];
    const movedWire = createWire(moved, fetches, opened);
    const movedPath = join(moved, "docs", "portable.md");
    assert.equal((await movedWire.showResource(movedPath, moved)).id, "notion:portable");
    const synced = await movedWire.sync("notion:portable", moved);
    assert.equal(synced.path, movedPath);
    assert.equal(await readFile(movedPath, "utf8"), "# Revision 2\n");
    assert.deepEqual(synced.resource.filesystem_links, [{ path: "docs/portable.md", role: "primary", data: { format: "markdown" } }]);
    assert.equal((await movedWire.openResource("docs/portable.md", moved)).id, "notion:portable");
    assert.deepEqual(opened, ["https://notion.test/portable"]);
  }
});

test("show, resolve, sync, and open support URL, path, and id", async () => {
  const project = join(testRoot, "resolve-open");
  await mkdir(project);
  const opened = [];
  const wire = createWire(project, async () => ({ title: "Page", markdown: "# Page\n", data: {} }), opened);
  const created = await wire.create("https://notion.test/page", project);
  assert.equal((await wire.showResource("https://notion.test/page", project)).id, "notion:page");
  assert.equal((await wire.showResource(created.path, project)).id, "notion:page");
  assert.equal((await wire.showResource("notion:page", project)).id, "notion:page");
  assert.equal((await wire.sync("notion:page", project)).path, created.path);
  assert.equal((await wire.openResource(created.path, project)).id, "notion:page");
  assert.deepEqual(opened, ["https://notion.test/page"]);
});

test("path resolution rejects shared and missing registry paths", async () => {
  for (const backend of ["sqlite", "files"]) {
    const project = join(testRoot, `resolve-ambiguous-${backend}`);
    await mkdir(project);
    await initializeWire(project, backend, backend === "sqlite" ? "registry.sqlite3" : "records");
    const wire = createWire(project, async () => ({ title: "Shared", markdown: "# Shared\n", data: {} }));
    const first = await wire.create("https://notion.test/one", project);
    const second = await wire.create("https://slack.test/two", project);
    const registry = await openWireRegistry(project, project);
    await registry.put({ ...second.resource, filesystem_links: first.resource.filesystem_links });
    await assert.rejects(() => wire.showResource(first.path, project), /Ambiguous resource path shared\.md: notion:one, slack:two\. Use a resource id or URL\./);
    assert.equal((await wire.showResource("notion:one", project)).id, "notion:one");
    assert.equal((await wire.showResource("https://slack.test/two", project)).id, "slack:two");
    await assert.rejects(() => wire.showResource("missing.md", project), /Resource path not found: missing\.md/);
    await writeFile(join(project, "missing.md"), "# Missing\n");
    await assert.rejects(() => wire.showResource("missing.md", project), /Resource path is not registered: missing\.md/);
    const subdir = join(project, "subdir");
    await mkdir(subdir);
    await assert.rejects(() => wire.showResource("missing.md", subdir), /Resource path not found: missing\.md/);
    const absoluteMissing = join(subdir, "missing.md");
    await assert.rejects(() => wire.showResource(absoluteMissing, subdir), (error) => {
      assert.equal(error.message, `Resource path not found: ${absoluteMissing}`);
      return true;
    });
    await assert.rejects(() => wire.showResource("https://notion.test/missing", project), /Resource URL not found: https:\/\/notion\.test\/missing/);
    await assert.rejects(() => wire.showResource("missing:id", project), /Resource not found: missing:id/);
  }
});

test("init uses only explicit initialization arguments", async () => {
  const project = join(testRoot, "explicit-init");
  await mkdir(project);
  const wire = createWire(project, async () => ({ title: "unused", markdown: "", data: {} }));
  assert.deepEqual(await wire.init(project, "files", "records"), { root: join(project, ".wire"), backend: "files", path: join(project, ".wire", "records"), created: true });
});
