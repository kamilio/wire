import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { composeWire, configuredWireRoot, initializeWire, openWireRegistry, switchWireBackend, wireRelativePath, WireMergeConflict } from "wire-core";

async function fixture(t, backend) {
  const parent = resolve("out");
  await mkdir(parent, { recursive: true });
  const path = await mkdtemp(join(parent, "wire-history-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  await initializeWire(path, backend, backend === "sqlite" ? "registry.sqlite3" : "records");
  const doc = { markdown: "base\n", writes: 0, before: undefined, after: undefined };
  const remote = () => ({ title: "Document", markdown: doc.markdown, data: { providerState: doc.markdown } });
  const service = {
    name: "google-docs", matches: () => true,
    parse: () => ({ service: "google-docs", type: "document", identifier: "synthetic" }),
    fetch: async () => remote(),
    synchronize: async (_input, _url, _source, base, local, _path, observe) => {
      const seen = remote();
      await observe(seen);
      await doc.before?.();
      if (base.providerState !== doc.markdown && local !== base.markdown && local !== doc.markdown) throw new WireMergeConflict("Overlapping paragraph.");
      if (local !== base.markdown && local !== doc.markdown) {
        doc.markdown = local; doc.writes++; await doc.after?.(); return { ...remote(), wroteRemote: true };
      }
      return { ...remote(), wroteRemote: false };
    },
  };
  const make = () => composeWire({
    home: path, catalog: [service], fetchInput: {}, initialization: { backend, registryPath: "records" },
    workspace: { configuredRoot: configuredWireRoot, initialize: initializeWire, openRegistry: openWireRegistry, relativePath: wireRelativePath, switchBackend: switchWireBackend },
    filesystem: { exists: p => stat(p).then(() => true, () => false), isFile: p => stat(p).then(s => s.isFile(), () => false), readText: p => readFile(p, "utf8"), writeText: async (p, s) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, s); } },
    now: () => new Date("2026-06-16T11:00:00Z"), open: async () => { },
  });
  const wire = make(), { path: file } = await wire.attach("https://docs.example/synthetic", path);
  return { path, file, make, wire, doc };
}

for (const backend of ["sqlite", "files"]) {
  test(backend + ": overlapping edits retain exact three versions through restart, backend switch, and newer remote", async t => {
    const { path, file, make, wire, doc } = await fixture(t, backend);
    await writeFile(file, "local\n"); doc.markdown = "remote\n";
    await assert.rejects(wire.sync(file, path), /Unresolved Wire conflict/);
    await wire.switchBackend(path);
    const after = make();
    const { conflict } = await after.historyStatus(file, path);
    const read = id => after.historyDiff(file, path, id, id).then(d => d.before);
    assert.deepEqual([await read(conflict.base), await read(conflict.local), await read(conflict.remote)], ["base\n", "local\n", "remote\n"]);
    await assert.rejects(after.download(file, path), /Unresolved/);
    await assert.rejects(after.sync(file, path), /Unresolved/);
    assert.equal(doc.writes, 0);
    await after.resolveConflict(file, path, "local");
    doc.markdown = "newer\n";
    await assert.rejects(after.sync(file, path), /Unresolved/);
    const second = (await make().historyStatus(file, path)).conflict;
    assert.equal(await read(second.base), "remote\n");
    assert.equal(await read(second.remote), "newer\n");
    await writeFile(file, "manually combined\n");
    await assert.rejects(after.resolveConflict(file, path, "remote"), /Working file changed/);
    await after.resolveConflict(file, path, "working");
    assert.equal(doc.writes, 0);
    await after.sync(file, path);
    assert.equal(doc.markdown, "manually combined\n");
    assert.equal(doc.writes, 1);
    assert.equal((await after.historyStatus(file, path)).modified, false);
  });

  test(backend + ": stale shell generations fail even if the document bytes return to the opening value", async t => {
    const { path, file, wire, make, doc } = await fixture(t, backend);
    const start = await wire.historyDiff(file, path, "working", "working");
    await wire.checkpoint(file, path, start.before, "new\n", start.token);
    const later = await make().historyDiff(file, path, "working", "working");
    await make().checkpoint(file, path, later.before, start.before, later.token);
    await assert.rejects(wire.checkpoint(file, path, start.before, "stale\n", start.token), /Stale shell/);
    assert.equal(doc.writes, 0);
    assert.equal(await readFile(file, "utf8"), "base\n");
  });
}

test("a provider observation during a failed local publish never advances the materialized base", async t => {
  const { path, file, wire, doc, make } = await fixture(t, "files");
  const start = await wire.historyStatus(file, path);
  doc.markdown = "remote inserted paragraph\n";
  doc.before = () => writeFile(file, "changed during provider read\n");
  await assert.rejects(wire.sync(file, path), /changed during sync/);
  const after = make();
  assert.equal((await after.historyStatus(file, path)).base, start.base);
  assert.deepEqual((await after.historyDiff(file, path, "base", "remote")).after, doc.markdown);
  assert.equal(await readFile(file, "utf8"), "changed during provider read\n");
  assert.equal(doc.writes, 0);
});

test("an interrupted stage write cannot become a partially delivered document", async t => {
  const {file,path,wire,doc,make}=await fixture(t,"files");
  doc.markdown="complete remote replacement\n";
  const fs=(await import("node:fs/promises")).default;
  const {syncBuiltinESMExports}=await import("node:module");
  const original=fs.open;
  let interrupted=false;
  fs.open=async (...args)=>{
    const fd=await original(...args);
    if(args[1]!=="wx" || interrupted) return fd;
    const write=fd.writeFile.bind(fd);
    fd.writeFile=async (content,...rest)=>{
      // Only interrupt the cooked worktree stage, after write-ahead intent is durable.
      const {access}=fs;
      if(content===doc.markdown && await access(join(dirname(args[0]),"pending.json")).then(()=>true,()=>false)){
        interrupted=true;
        await write("partial");
        throw new Error("interrupted stage");
      }
      return write(content,...rest);
    };
    return fd;
  };
  try {
    syncBuiltinESMExports();
    await assert.rejects(wire.sync(file,path),/interrupted stage/);
  } finally { fs.open=original; syncBuiltinESMExports(); }
  assert.equal(interrupted,true);
  assert.equal(await readFile(file,"utf8"),"base\n");
  assert.equal((await make().historyStatus(file,path)).modified,false);
  assert.equal(await readFile(file,"utf8"),doc.markdown);
});

test("history discovers a late save on a displaced inode without advancing any head", async t => {
  const {path,file,wire,doc,make}=await fixture(t,"files");
  const {open}=await import("node:fs/promises");
  const fd=await open(file,"r+");
  try {
    doc.markdown="new remote\n";
    await wire.sync(file,path);
    await fd.truncate(0);
    await fd.write("late save by the old editor\n",0,"utf8");
  } finally { await fd.close(); }
  const fresh=make();
  const before=await fresh.historyStatus(file,path);
  const entries=await fresh.historyLog(file,path);
  const saved=entries.find(r=>r.kind==="recovered");
  assert.ok(saved);
  assert.deepEqual(saved.parents,[]);
  assert.equal((await fresh.historyDiff(file,path,saved.id,"working")).before,"late save by the old editor\n");
  assert.equal((await fresh.historyLog(file,path)).length,entries.length);
  assert.deepEqual(await fresh.historyStatus(file,path),before);
  await fresh.sync(file,path);
  assert.equal(await readFile(file,"utf8"),"new remote\n");
  assert.equal(doc.writes,0);
});

test("corrupt ancestry and PID reuse fail closed before provider writes", async t => {
  const {path,file,wire,doc}=await fixture(t,"files");
  const {readdir,symlink,unlink}=await import("node:fs/promises");
  const {hostname}=await import("node:os");
  const {createHash}=await import("node:crypto");
  const root=join(path,".wire","history"), key=createHash("sha256").update("google-docs:synthetic").digest("hex");
  const lock=join(root,"lock-"+key);
  // A reused, live PID (even with an unrelated nonce) is not proof of death.
  await symlink(hostname()+":"+process.pid+":unrelated-previous-owner",lock);
  await assert.rejects(wire.sync(file,path),/Another Wire operation/);
  await unlink(lock);
  const dir=join(root,(await readdir(root)).find(n=>/^[a-f0-9]{64}$/.test(n)));
  const refs=join(dir,"refs.json"),saved=JSON.parse(await readFile(refs,"utf8"));
  saved.revisions[0].blob="../outside";
  await writeFile(refs,JSON.stringify(saved));
  await assert.rejects(wire.sync(file,path),/Corrupt Wire history/);
  assert.equal(doc.writes,0);
});
