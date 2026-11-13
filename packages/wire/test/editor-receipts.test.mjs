import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { composeWire, configuredWireRoot, initializeWire, openWireRegistry, wireRelativePath } from "../../wire-core/dist/index.js";
import { editorFile, editorView } from "../../wire-core/dist/storage/editor-receipts.js";
import { mergeDocBlocks } from "../../provider-google-docs/dist/doc-blocks.js";

test("receipt codec preserves Markdown bytes; the delimiter belongs to the receipt", () => {
  const receipts = {};
  for (const body of ["", "a", "a\n", "a\n\n", "a  \n", "\t  ", "\ufeff---\r\ny: z\r\n---\r\nBody  \r\n", "---\ny: z\n---", "\ufeffBody", "mixed\r\nend\n", "end\r", "📓\t", "<!-- body -->", "The wire-editor-basis: field appears in an HTML comment."]) {
    const tagged = editorFile(body, receipts, "revision", "revision");
    assert.ok(tagged.startsWith(body));
    assert.equal(editorView(tagged, receipts).markdown, body);
    assert.equal(editorView(tagged + "\nafter", receipts).markdown, body + "\nafter");
    assert.throws(() => editorView(tagged, {}), /receipt/);
  }
});

async function fixture(t, backend) {
  await mkdir("out", { recursive: true });
  const path = await mkdtemp(resolve("out/receipt-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  await initializeWire(path, backend, backend === "files" ? "records" : "registry.sqlite3");
  const A = "Top\nMiddle\nBottom\n", B = "Top\nMiddle\nNew B\nBottom\n", C = B + "New C\n";
  const doc = { value: A, writes: [], reads: 0, uploads: 0, observes: [] };
  const fetch = async () => ({ title: "Note", markdown: doc.value, data: { markdown: doc.value, verified_revision: "for:" + doc.value } });
  const service = { name: "google-docs", matches: () => true,
    parse: u => ({ service: "google-docs", type: "document", identifier: u.pathname }),
    fetch, upload: () => { doc.uploads++; throw Error("unexpected upload"); },
    synchronize: async (_input, _url, _src, base, local, _path, observe, strict) => {
      doc.reads++;
      const remote = await fetch(); await observe(remote);
      assert.ok(!local.includes("wire-editor-basis:"));
      if (base.verified_revision) assert.equal(base.verified_revision, "for:" + base.markdown);
      const next = mergeDocBlocks(base.markdown, local, doc.value);
      if (next !== doc.value) {
        assert.equal(strict, true); doc.writes.push({ base: base.markdown, local, remote: doc.value, next });
        doc.value = next; return { ...await fetch(), wroteRemote: true };
      }
      return { ...remote, wroteRemote: false };
    } };
  const make = () => composeWire({
    home: path, catalog: [service], fetchInput: {}, initialization: { backend, registryPath: "records" },
    workspace: { configuredRoot: configuredWireRoot, initialize: initializeWire, openRegistry: openWireRegistry, relativePath: wireRelativePath },
    filesystem: { exists: p => stat(p).then(() => true, () => false), isFile: p => stat(p).then(s => s.isFile(), () => false),
      readText: p => readFile(p, "utf8"), writeText: (p, s) => writeFile(p, s) },
    now: () => new Date("2026-06-16T11:00:00Z"), open: async () => {} });
  const wire = make(), url = "https://docs.example/receipt", { path: file } = await wire.attach(url, path, true);
  return { A, B, C, doc, make, wire, path, file, url, read: () => readFile(file, "utf8"), save: text => writeFile(file, text) };
}

for (const backend of ["sqlite", "files"]) {
  test(backend + ": open A, materialize B, save stale A, merge with live C, then save A again", async t => {
    const f = await fixture(t, backend), { wire, doc, file, path, A, B, C } = f;
    const buffer = await f.read(), base = (await wire.historyStatus(file, path)).base;
    doc.value = B; await wire.sync(file, path);
    assert.equal((await wire.historyStatus(file, path)).modified, false);
    const bBuffer = await f.read();
    const logical = await wire.historyDiff(file, path, "working", "working");
    const stale = buffer.replace("Top", "Local");
    await writeFile(file + ".saving", stale); await rename(file + ".saving", file);
    doc.value = C;
    await assert.rejects(wire.checkpoint(file, path, logical.before, "oops", logical.token), /Stale shell/);
    const d = await wire.historyDiff(file, path, "working", "working");
    assert.equal(d.before, "Local\nMiddle\nBottom\n");
    await wire.checkpoint(file, path, d.before, d.before.replace("Middle", "Shell"), d.token);
    const merged = await f.make().sync(file, path);
    assert.equal(merged.markdown, "Local\nShell\nNew B\nBottom\nNew C\n");
    assert.equal(doc.writes[0].base, A); assert.equal(doc.writes[0].remote, C);
    assert.equal((await wire.historyStatus(file,path)).modified, false);
    const tree = await wire.historyLog(file,path);
    assert.ok(tree.some(r => r.kind === "local" && r.parents.includes(base)));
    assert.ok(tree.some(r => r.kind === "merge" && r.parents.length === 2));
    // Earlier B buffer now changes the same paragraph that the A branch changed.
    await f.save(bBuffer.replace("Top", "Another"));
    await assert.rejects(wire.sync(file,path), /Unresolved Wire conflict/);
    const conflict = (await wire.historyStatus(file,path)).conflict;
    const read = async r => (await wire.historyDiff(file,path,r,r)).before;
    assert.deepEqual([await read(conflict.base),await read(conflict.local),await read(conflict.remote)],
      [B, B.replace("Top","Another"), merged.markdown]);
    assert.equal(doc.writes.length,1);
    await wire.resolveConflict(file,path,"remote"); await wire.sync(file,path);
    await f.save(buffer.replace("Bottom","Finished"));
    assert.equal((await wire.sync(file,path)).markdown,"Local\nShell\nNew B\nFinished\nNew C\n");
    assert.equal(doc.writes.at(-1).base,A);
  });
}

test("lost, copied and malformed receipts never reach upload, sync, shell or another link", async t => {
  const f = await fixture(t, "files"), { wire, doc, file, path } = f;
  const valid = await f.read();
  for (const bad of [f.A, valid.replace(/:[a-f0-9]{48}/, ":"+"0".repeat(48)), valid + "\n" + valid, valid.replace("<!-- wire-editor-basis:", "<!--  WIRE-EDITOR-BASIS?")]) {
    await f.save(bad);
    await assert.rejects(wire.sync(file,path), /receipt/);
    await assert.rejects(wire.historyDiff(file,path,"working","working"), /receipt/);
    assert.equal(await f.read(), bad);
  }
  for (const [url, enable] of [["https://docs.example/other", true],["https://docs.example/plain", false]]) {
    const other = (await wire.attach(url,path,enable)).path;
    await writeFile(other, valid);
    await assert.rejects(wire.sync(other,path), /receipt/);
  }
  const copied = join(path,"copied.md"); await writeFile(copied,valid);
  await assert.rejects(wire.sync(copied,path),/receipt/);
  assert.equal(doc.reads, 0); assert.equal(doc.uploads,0);
  await f.save(valid);
  const result = await wire.detach(file,path);
  assert.equal(result.markdown,f.A); assert.equal(await f.read(),f.A);
  const adopted = await wire.adopt(f.url,file);
  assert.equal(await f.read(),f.A); assert.equal(adopted.resource.filesystem_links[0].data.editor_receipts,undefined);
  await wire.attach(f.url,path,true);
  assert.ok((await f.read()).includes("wire-editor-basis:"));
  assert.notEqual(await f.read(),valid);
  assert.ok((await wire.historyLog(file,path)).length);
  await f.save(valid);
  await assert.rejects(wire.sync(file,path), /receipt/);
});
