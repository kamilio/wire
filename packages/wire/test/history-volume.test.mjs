import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { test } from "node:test";
import { composeWire, initializeWire, openWireRegistry, wireRelativePath } from "wire-core";

test("another volume cannot start a publication or contact a provider; a vault-local registry works", async t => {
  const work = resolve("out");
  await fs.mkdir(work, { recursive: true });
  const home = await fs.mkdtemp(join(work, "volume-home-"));
  const vault = await fs.mkdtemp(join(process.env.WIRE_TEST_VOLUME ?? work, "volume-vault-"));
  t.after(() => Promise.all([home, vault].map(path => fs.rm(path, { recursive: true, force: true }))));
  if (process.env.WIRE_TEST_VOLUME) assert.notEqual((await fs.stat(home)).dev, (await fs.stat(vault)).dev);
  else {
    // CI doesn't need a privileged mount. Model only the device identity of vault entries.
    const original = fs.stat;
    const mocked = t.mock.method(fs, "stat", async function(path, options) {
      const stat = await original(path, options);
      if (path === vault || String(path).startsWith(vault + sep)) stat.dev += typeof stat.dev === "bigint" ? 1n : 1;
      return stat;
    });
    syncBuiltinESMExports();
    t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  }
  await initializeWire(home, "files", "records");
  const url = "https://notion.example/note";
  const result = { title: "Note", markdown: "base\n", data: {} };
  let requests = 0;
  const wire = composeWire({
    home, fetchInput: {}, catalog: [{ name: "notion", matches: () => true, parse: () => ({ service:"notion", identifier:"doc", type:"document" }),
      fetch: async () => { requests++; return result; }, synchronize: async () => { requests++; return result; },
      upload: async () => { requests++; return { ...result, url }; } }],
    initialization: { backend:"files", registryPath:"records" },
    workspace: { configuredRoot: async p => (p === vault || p.startsWith(vault + sep)) && await fs.stat(join(vault,".wire")).catch(() => null) ? join(vault,".wire") : join(home,".wire"), initialize: initializeWire, openRegistry: openWireRegistry, relativePath: wireRelativePath },
    filesystem: { exists: path => fs.stat(path).then(() => true, () => false), isFile: path => fs.stat(path).then(s => s.isFile(), () => false), readText: p => fs.readFile(p,"utf8"), writeText: (p,s) => fs.writeFile(p,s) },
    now: () => new Date(), open: async () => {},
  });
  const template = await wire.attach(url, home);
  const registry = await openWireRegistry(home, home);
  await registry.delete(template.resource.id);
  const expected = /same filesystem.*wire init/s;
  const file = join(vault,"note.md");
  await fs.writeFile(file, result.markdown);
  requests = 0;
  await assert.rejects(wire.attach(url,vault), expected);
  await assert.rejects(wire.adopt(url,file), expected);
  await assert.rejects(wire.sync(file,vault), expected); // Unregistered Notion upload
  await registry.put({ ...template.resource, filesystem_links: [{path:wireRelativePath(file, join(home,".wire")),role:"primary",data:{}}] });
  await fs.writeFile(file,"user edit\n");
  const opened = await wire.historyDiff(file,vault,"working","working");
  await assert.rejects(wire.sync(file,vault), expected);
  await assert.rejects(wire.checkpoint(file,vault,opened.before,"shell edit\n",opened.token), expected);
  assert.equal(requests,0);
  assert.equal(await fs.readFile(file,"utf8"),"user edit\n");
  const files = await fs.readdir(join(home,".wire","history"), {recursive:true});
  assert.ok(!files.some(p => p.endsWith("pending.json") || p.endsWith(".new")));
  await initializeWire(vault, "files", "records");
  const local = await wire.attach(url,vault);
  assert.equal(dirname(local.path),vault);
  assert.equal(await fs.readFile(file,"utf8"),"user edit\n");
  assert.equal(requests,1);
});
