import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { promisify } from "node:util";

import {
  FileRegistry,
  SqliteRegistry,
  configuredWireRoot,
  discoverWireRoot,
  initializeWire,
  loadWireConfig,
  normalizeResource,
  openWireRegistry,
  stableJsonPretty,
  switchWireBackend,
  wireRelativePath,
} from "../dist/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const testRoot = join(repositoryRoot, "out", "wire-ts-storage");
const execFileAsync = promisify(execFile);

const resourceA = {
  id: "resource:b",
  type: "document",
  identifiers: [{ service: "z", identifier: "2" }, { service: "a", identifier: "1" }],
  urls: ["https://example.com/z", "https://example.com/a"],
  filesystem_links: [{ path: "folder/file.md", role: "primary", data: { z: "Żółć", a: 1 } }],
  data: [{ namespace: "z", key: "b", value: { z: true, a: [2, 1] } }, { namespace: "a", key: "a", value: "😀" }],
  relationships: [{ target_id: "target:b", type: "contains", data: { z: 2, a: 1 } }],
};

const resourceB = {
  id: "resource:a",
  type: "task",
  identifiers: [{ service: "service", identifier: "other" }],
  urls: ["https://example.com/other"],
  filesystem_links: [{ path: "folder/file.md", role: "secondary", data: {} }],
  data: [],
  relationships: [],
};

before(async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
});

after(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

for (const [name, createRegistry] of [
  ["sqlite", (path) => new SqliteRegistry(join(path, "registry.sqlite3"))],
  ["files", (path) => new FileRegistry(join(path, "records"))],
]) {
  test(`${name} supports replacement, ordering, lookup, and deletion`, async () => {
    const path = join(testRoot, `${name}-behavior`);
    await mkdir(path);
    const registry = createRegistry(path);
    assert.deepEqual(await registry.put(resourceA), {
      ...resourceA,
      identifiers: [{ service: "a", identifier: "1" }, { service: "z", identifier: "2" }],
      urls: ["https://example.com/a", "https://example.com/z"],
      data: [{ namespace: "a", key: "a", value: "😀" }, { namespace: "z", key: "b", value: { z: true, a: [2, 1] } }],
    });
    await registry.put(resourceB);
    assert.deepEqual((await registry.listResources()).map((resource) => resource.id), ["resource:a", "resource:b"]);
    assert.equal((await registry.findByIdentifier("a", "1")).id, resourceA.id);
    assert.equal((await registry.findByUrl("https://example.com/a")).id, resourceA.id);
    assert.deepEqual((await registry.findByPath("folder/file.md")).map((resource) => resource.id), ["resource:a", "resource:b"]);
    await registry.put({ ...resourceA, type: "project", identifiers: [], urls: [], filesystem_links: [], data: [], relationships: [] });
    assert.deepEqual(await registry.get(resourceA.id), { ...resourceA, type: "project", identifiers: [], urls: [], filesystem_links: [], data: [], relationships: [] });
    await registry.delete(resourceA.id);
    assert.deepEqual((await registry.listResources()).map((resource) => resource.id), ["resource:a"]);
  });

  test(`${name} enforces identifier and URL uniqueness`, async () => {
    const path = join(testRoot, `${name}-duplicates`);
    await mkdir(path);
    const registry = createRegistry(path);
    await registry.put(resourceA);
    await assert.rejects(registry.put({ ...resourceB, identifiers: [resourceA.identifiers[0]], urls: [] }));
    await assert.rejects(registry.put({ ...resourceB, identifiers: [], urls: [resourceA.urls[0]] }));
    assert.deepEqual(await registry.get(resourceA.id), await registry.put(resourceA));
    await assert.rejects(registry.put({ ...resourceA, identifiers: [resourceA.identifiers[0], resourceA.identifiers[0]], urls: [] }));
    await assert.rejects(registry.put({ ...resourceA, identifiers: [], urls: [resourceA.urls[0], resourceA.urls[0]] }));
    await assert.rejects(registry.put({ ...resourceA, identifiers: [], urls: [], filesystem_links: [resourceA.filesystem_links[0], resourceA.filesystem_links[0]] }));
    await assert.rejects(registry.put({ ...resourceA, identifiers: [], urls: [], data: [resourceA.data[0], resourceA.data[0]] }));
    await assert.rejects(registry.put({ ...resourceA, identifiers: [], urls: [], relationships: [resourceA.relationships[0], resourceA.relationships[0]] }));
    assert.deepEqual(await registry.get(resourceA.id), await registry.put(resourceA));
  });

  test(`${name} fails missing single-record lookups and deletion`, async () => {
    const path = join(testRoot, `${name}-missing`);
    await mkdir(path);
    const registry = createRegistry(path);
    await assert.rejects(registry.get("missing"), /Resource not found: missing/);
    await assert.rejects(registry.findByIdentifier("missing", "missing"), /Resource identifier not found: missing\/missing/);
    await assert.rejects(registry.findByUrl("https:\/\/example.com\/missing"), /Resource URL not found: https:\/\/example.com\/missing/);
    if (name === "files") await assert.rejects(registry.delete("missing"));
    else await registry.delete("missing");
  });
}

test("file records have deterministic canonical bytes", async () => {
  const path = join(testRoot, "deterministic-files");
  const registry = new FileRegistry(path);
  await registry.put(resourceA);
  const first = await readFile(join(path, `${resourceA.id}.json`), "utf8");
  await registry.put(resourceA);
  const second = await readFile(join(path, `${resourceA.id}.json`), "utf8");
  assert.equal(first, second);
  assert.equal(first, `${stableJsonPretty(normalizeResource(resourceA))}\n`);
  assert.equal(first.at(-1), "\n");
  assert.deepEqual(await readdir(path), [`${resourceA.id}.json`]);
});

test("file registry ignores non-json entries and orders filenames canonically", async () => {
  const path = join(testRoot, "file-listing");
  const registry = new FileRegistry(path);
  await registry.put({ ...resourceA, id: "resource:z" });
  await registry.put({ ...resourceB, id: "resource:a" });
  await writeFile(join(path, "ignored.txt"), "ignored");
  await mkdir(join(path, "ignored.json"));
  await assert.rejects(registry.listResources());
  await rm(join(path, "ignored.json"), { recursive: true });
  assert.deepEqual((await registry.listResources()).map((resource) => resource.id), ["resource:a", "resource:z"]);
});

test("file registry uses code point Unicode filename ordering", async () => {
  const path = join(testRoot, "files-unicode-ordering");
  const registry = new FileRegistry(path);
  await registry.put({ ...resourceA, id: "resource:😀", identifiers: [], urls: [] });
  await registry.put({ ...resourceA, id: "resource:\uE000", identifiers: [], urls: [] });
  assert.deepEqual((await registry.listResources()).map((resource) => resource.id), ["resource:\uE000", "resource:😀"]);
});

test("file registry stores path-unsafe resource IDs inside its directory", async () => {
  const path = join(testRoot, "files-path-unsafe-ids");
  const registry = new FileRegistry(path);
  const resources = ["../escape", "slash/id", "backslash\\id", ".", "..", "nul\0id"].map((id) => ({ ...resourceA, id, identifiers: [], urls: [] }));
  for (const resource of resources) await registry.put(resource);
  assert.deepEqual((await registry.listResources()).map((resource) => resource.id), [".", "..", "../escape", "backslash\\id", "nul\0id", "slash/id"]);
  for (const resource of resources) assert.deepEqual(await registry.get(resource.id), normalizeResource(resource));
  assert.deepEqual((await readdir(path)).every((filename) => filename.endsWith(".json")), true);
  await assert.rejects(stat(join(testRoot, "escape.json")));
});

test("file registry path-unsafe resource IDs round trip inside encoded filenames", async () => {
  const path = join(testRoot, "files-path-unsafe-encoded");
  const registry = new FileRegistry(path);
  const resources = ["../escape", "slash/id", "backslash\\id", ".", ".."].map((id) => ({ ...resourceA, id, identifiers: [], urls: [] }));
  for (const resource of resources) await registry.put(resource);
  assert.deepEqual((await registry.listResources()).map((resource) => resource.id), [".", "..", "../escape", "backslash\\id", "slash/id"]);
  for (const resource of resources) assert.deepEqual(await registry.get(resource.id), normalizeResource(resource));
  assert.deepEqual((await readdir(path)).every((filename) => filename.endsWith(".json")), true);
  await registry.put({ ...resourceA, id: "nested/id", identifiers: [], urls: [] });
  assert.deepEqual(await registry.get("nested/id"), normalizeResource({ ...resourceA, id: "nested/id", identifiers: [], urls: [] }));
});

test("file registry compares identifier fields without composite-key collisions", async () => {
  const path = join(testRoot, "files-identifier-fields");
  const registry = new FileRegistry(path);
  await registry.put({ ...resourceA, identifiers: [{ service: "a", identifier: "b\0c" }], urls: [] });
  await registry.put({ ...resourceB, identifiers: [{ service: "a\0b", identifier: "c" }], urls: [] });
  assert.equal((await registry.findByIdentifier("a", "b\0c")).id, resourceA.id);
  assert.equal((await registry.findByIdentifier("a\0b", "c")).id, resourceB.id);
});

test("sqlite schema and pragmas are canonical", () => {
  const path = join(testRoot, "sqlite-schema", "registry.sqlite3");
  new SqliteRegistry(path);
  const database = new DatabaseSync(path);
  assert.equal(database.prepare("PRAGMA journal_mode").get().journal_mode, "delete");
  assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name),
    ["filesystem_links", "resource_data", "resource_identifiers", "resource_relationships", "resource_urls", "resources"],
  );
  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name").all().map((row) => row.name),
    ["filesystem_links_path", "resource_relationships_target"],
  );
  assert.deepEqual(
    database.prepare("PRAGMA foreign_key_list(resource_identifiers)").all().map((row) => [row.table, row.from, row.to, row.on_delete]),
    [["resources", "resource_id", "id", "CASCADE"]],
  );
  database.close();
});

test("sqlite waits for a concurrent writer lock", async () => {
  const path = join(testRoot, "sqlite-busy-timeout", "registry.sqlite3");
  new SqliteRegistry(path);
  const database = new DatabaseSync(path);
  database.exec("BEGIN EXCLUSIVE");
  const child = execFileAsync(process.execPath, [
    "--input-type=module",
    "--eval",
    `
      const { SqliteRegistry } = await import(${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)});
      const registry = new SqliteRegistry(${JSON.stringify(path)});
      await registry.put(${JSON.stringify(resourceB)});
    `,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 250));
  database.exec("COMMIT");
  database.close();
  await child;
  assert.equal((await new SqliteRegistry(path).get(resourceB.id)).id, resourceB.id);
});

test("sqlite reads wait for a concurrent writer lock", async () => {
  const path = join(testRoot, "sqlite-read-busy-timeout", "registry.sqlite3");
  const registry = new SqliteRegistry(path);
  await registry.put(resourceA);
  const database = new DatabaseSync(path);
  database.exec("BEGIN EXCLUSIVE");
  const child = execFileAsync(process.execPath, [
    "--input-type=module",
    "--eval",
    `
      const { SqliteRegistry } = await import(${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)});
      const registry = new SqliteRegistry(${JSON.stringify(path)});
      const resources = await registry.listResources();
      console.log(resources.map((resource) => resource.id).join("\\n"));
    `,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 250));
  database.exec("COMMIT");
  database.close();
  const execution = await child;
  assert.equal(execution.stdout, `${resourceA.id}\n`);
});

test("workspace discovery, configuration, relative paths, and initialization", async () => {
  const home = join(testRoot, "workspace-home");
  const project = join(home, "project");
  const nested = join(project, "nested");
  await mkdir(nested, { recursive: true });
  const initialized = await initializeWire(project, "files", "records");
  assert.deepEqual(initialized, { root: join(project, ".wire"), backend: "files", path: join(project, ".wire", "records"), created: true });
  assert.equal(await discoverWireRoot(nested, home), join(project, ".wire"));
  assert.equal(await configuredWireRoot(nested, home), join(project, ".wire"));
  assert.deepEqual(await loadWireConfig(join(project, ".wire")), { backend: "files", path: "records" });
  assert.equal(wireRelativePath(join(project, "folder", "file.md"), join(project, ".wire")), "folder/file.md");
  assert.ok((await openWireRegistry(join(nested, "missing.md"), home)) instanceof FileRegistry);
  const sqliteProject = join(home, "sqlite-project");
  await mkdir(sqliteProject);
  await initializeWire(sqliteProject, "sqlite", "registry.sqlite3");
  assert.ok((await openWireRegistry(sqliteProject, home)) instanceof SqliteRegistry);
  assert.equal(await discoverWireRoot("/", home), join(home, ".wire"));
  assert.equal(await configuredWireRoot("/", home), null);
});

test("workspace discovery chooses the nearest workspace inside and outside home", async () => {
  const home = join(testRoot, "discovery-home");
  const homeProject = join(home, "project");
  const nestedProject = join(homeProject, "nested");
  const outside = join(testRoot, "outside", "project");
  await mkdir(join(home, ".wire"), { recursive: true });
  await writeFile(join(home, ".wire", "config.json"), '{"backend":"files","path":"records"}\n');
  await mkdir(join(homeProject, ".wire"), { recursive: true });
  await mkdir(join(nestedProject, "folder"), { recursive: true });
  await mkdir(outside, { recursive: true });
  assert.equal(await discoverWireRoot(join(nestedProject, "folder", "missing.md"), home), join(homeProject, ".wire"));
  assert.equal(await discoverWireRoot(join(outside, "missing.md"), home), join(repositoryRoot, ".wire"));
});

test("initialization writes exact config bytes for both backends", async () => {
  for (const [backend, path] of [["sqlite", "registry.sqlite3"], ["files", "records"]]) {
    const root = join(testRoot, `initialize-${backend}`);
    await mkdir(root);
    await initializeWire(root, backend, path);
    assert.equal(await readFile(join(root, ".wire", "config.json"), "utf8"), `{\n  "backend": "${backend}",\n  "path": "${path}"\n}\n`);
    assert.ok((await stat(join(root, ".wire", path))).isDirectory() === (backend === "files"));
  }
});

test("initialization writes config inside an existing wire directory", async () => {
  const project = join(testRoot, "initialize-existing-wire");
  await mkdir(join(project, ".wire", "auth"), { recursive: true });
  const initialized = await initializeWire(project, "files", "records");
  assert.deepEqual(initialized, { root: join(project, ".wire"), backend: "files", path: join(project, ".wire", "records"), created: true });
  assert.equal(await readFile(join(project, ".wire", "config.json"), "utf8"), `{\n  "backend": "files",\n  "path": "records"\n}\n`);
});

test("initialization is idempotent for existing config", async () => {
  const project = join(testRoot, "initialize-idempotent");
  await mkdir(project);
  const first = await initializeWire(project, "sqlite", "registry.sqlite3");
  const second = await initializeWire(project, "sqlite", "registry.sqlite3");
  assert.deepEqual(first, { root: join(project, ".wire"), backend: "sqlite", path: join(project, ".wire", "registry.sqlite3"), created: true });
  assert.deepEqual(second, { root: join(project, ".wire"), backend: "sqlite", path: join(project, ".wire", "registry.sqlite3"), created: false });
  assert.equal(await readFile(join(project, ".wire", "config.json"), "utf8"), `{\n  "backend": "sqlite",\n  "path": "registry.sqlite3"\n}\n`);
});

test("initialization preserves existing config fields", async () => {
  const project = join(testRoot, "initialize-preserves-config");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, ".wire", "config.json"), `${stableJsonPretty({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "download", debounceMs: 250, pollMs: 30000 } })}\n`);
  assert.deepEqual(await initializeWire(project, "sqlite", "registry.sqlite3"), { root: join(project, ".wire"), backend: "sqlite", path: join(project, ".wire", "registry.sqlite3"), created: false });
  assert.equal(await readFile(join(project, ".wire", "config.json"), "utf8"), `${stableJsonPretty({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "download", debounceMs: 250, pollMs: 30000 } })}\n`);
});

test("initialization rejects conflicting existing config", async () => {
  const project = join(testRoot, "initialize-conflict");
  await mkdir(project);
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await assert.rejects(() => initializeWire(project, "files", "records"), /Wire workspace already initialized with sqlite registry at registry\.sqlite3\. Existing registries are not overwritten\./);
  assert.equal(await readFile(join(project, ".wire", "config.json"), "utf8"), `{\n  "backend": "sqlite",\n  "path": "registry.sqlite3"\n}\n`);
});

test("initialization is safe for concurrent first use", async () => {
  const project = join(testRoot, "initialize-concurrent");
  await mkdir(project);
  const results = await Promise.all([
    initializeWire(project, "sqlite", "registry.sqlite3"),
    initializeWire(project, "sqlite", "registry.sqlite3"),
  ]);
  assert.deepEqual(results.map((result) => ({ ...result, created: undefined })), [
    { root: join(project, ".wire"), backend: "sqlite", path: join(project, ".wire", "registry.sqlite3"), created: undefined },
    { root: join(project, ".wire"), backend: "sqlite", path: join(project, ".wire", "registry.sqlite3"), created: undefined },
  ]);
  assert.equal(results.some((result) => result.created), true);
  assert.equal(await readFile(join(project, ".wire", "config.json"), "utf8"), `{\n  "backend": "sqlite",\n  "path": "registry.sqlite3"\n}\n`);
});

test("explicit backend configuration opens the configured relative path", async () => {
  for (const [backend, registryPath] of [["sqlite", "nested/registry.sqlite3"], ["files", "nested/records"]]) {
    const project = join(testRoot, `configured-${backend}`);
    await mkdir(project);
    const initialized = await initializeWire(project, backend, registryPath);
    const registry = await openWireRegistry(join(project, "missing.md"), join(testRoot, "unused-home"));
    assert.equal(registry.path, initialized.path);
  }
});

test("switchWireBackend converts sqlite and files registries while preserving config data", async () => {
  const sqliteProject = join(testRoot, "switch-sqlite");
  await mkdir(sqliteProject);
  await initializeWire(sqliteProject, "sqlite", "registry.sqlite3");
  await writeFile(join(sqliteProject, ".wire", "config.json"), `${stableJsonPretty({ backend: "sqlite", path: "registry.sqlite3", watch: { mode: "download", debounceMs: 250, pollMs: 30000 } })}\n`);
  const sqliteRegistry = await openWireRegistry(sqliteProject, testRoot);
  await sqliteRegistry.put(resourceA);
  await new FileRegistry(join(sqliteProject, ".wire", "records")).put(resourceB);
  const sqliteSwitch = await switchWireBackend(sqliteProject, testRoot);
  assert.deepEqual(sqliteSwitch, {
    root: join(sqliteProject, ".wire"),
    from: "sqlite",
    to: "files",
    fromPath: join(sqliteProject, ".wire", "registry.sqlite3"),
    toPath: join(sqliteProject, ".wire", "records"),
    resources: 1,
  });
  assert.deepEqual(await loadWireConfig(join(sqliteProject, ".wire")), { backend: "files", path: "records", watch: { debounceMs: 250, mode: "download", pollMs: 30000 } });
  assert.equal(existsSync(join(sqliteProject, ".wire", "registry.sqlite3")), false);
  assert.ok((await openWireRegistry(sqliteProject, testRoot)) instanceof FileRegistry);
  assert.deepEqual(await (await openWireRegistry(sqliteProject, testRoot)).listResources(), [normalizeResource(resourceA)]);

  const filesProject = join(testRoot, "switch-files");
  await mkdir(filesProject);
  await initializeWire(filesProject, "files", "records");
  const filesRegistry = await openWireRegistry(filesProject, testRoot);
  await filesRegistry.put(resourceA);
  await filesRegistry.put(resourceB);
  const filesSwitch = await switchWireBackend(join(filesProject, "nested", "missing.md"), testRoot);
  assert.deepEqual(filesSwitch, {
    root: join(filesProject, ".wire"),
    from: "files",
    to: "sqlite",
    fromPath: join(filesProject, ".wire", "records"),
    toPath: join(filesProject, ".wire", "registry.sqlite3"),
    resources: 2,
  });
  assert.deepEqual(await loadWireConfig(join(filesProject, ".wire")), { backend: "sqlite", path: "registry.sqlite3" });
  assert.equal(existsSync(join(filesProject, ".wire", "records")), false);
  assert.ok((await openWireRegistry(filesProject, testRoot)) instanceof SqliteRegistry);
  assert.deepEqual(await (await openWireRegistry(filesProject, testRoot)).listResources(), [normalizeResource(resourceB), normalizeResource(resourceA)]);
});

for (const backend of ["sqlite", "files"]) {
  test(`${backend} persists records across registry instances`, async () => {
    const root = join(testRoot, `interop-${backend}`);
    await mkdir(root);
    const storagePath = backend === "sqlite" ? join(root, "registry.sqlite3") : join(root, "records");
    const writer = backend === "sqlite" ? new SqliteRegistry(storagePath) : new FileRegistry(storagePath);
    await writer.put(resourceA);
    await writer.put(resourceB);
    const reader = backend === "sqlite" ? new SqliteRegistry(storagePath) : new FileRegistry(storagePath);
    assert.deepEqual(await reader.get(resourceA.id), normalizeResource(resourceA));
    assert.deepEqual(await reader.get(resourceB.id), normalizeResource(resourceB));
    assert.deepEqual((await reader.listResources()).map((resource) => resource.id), ["resource:a", "resource:b"]);
  });

  test(`${backend} replacement and deletion update every index`, async () => {
    const root = join(testRoot, `mutation-${backend}`);
    await mkdir(root);
    const storagePath = backend === "sqlite" ? join(root, "registry.sqlite3") : join(root, "records");
    const replacement = {
      ...resourceA,
      type: "task",
      identifiers: [{ service: "replacement", identifier: "identifier" }],
      urls: ["https://example.com/replacement"],
      filesystem_links: [{ path: "replacement/file.md", role: "secondary", data: { replaced: true } }],
      data: [{ namespace: "replacement", key: "data", value: ["value"] }],
      relationships: [{ target_id: "target:replacement", type: "replaces", data: { replaced: true } }],
    };
    const registry = backend === "sqlite" ? new SqliteRegistry(storagePath) : new FileRegistry(storagePath);
    await registry.put(resourceA);
    await registry.put(replacement);
    await registry.delete(replacement.id);
    assert.deepEqual(await registry.listResources(), []);
    await assert.rejects(registry.findByIdentifier("replacement", "identifier"));
    await assert.rejects(registry.findByUrl("https://example.com/replacement"));
    assert.deepEqual(await registry.findByPath("replacement/file.md"), []);
    if (backend === "files") {
      assert.deepEqual(await readdir(storagePath), []);
    } else {
      const database = new DatabaseSync(storagePath);
      for (const table of ["resources", "resource_identifiers", "resource_urls", "filesystem_links", "resource_data", "resource_relationships"]) {
        assert.deepEqual(database.prepare(`SELECT * FROM ${table}`).all(), []);
      }
      database.close();
    }
  });
}
