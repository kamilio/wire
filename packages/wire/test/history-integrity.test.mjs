import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { DocumentHistory } from "../../wire-core/dist/storage/history.js";

async function fixture(t) {
  const out = resolve("out");
  await mkdir(out, {recursive:true});
  const root = await mkdtemp(join(out,"wire-integrity-"));
  t.after(() => rm(root, {recursive:true, force:true}));
  const snapshot = await DocumentHistory.load(root, "synthetic", () => new Date(0));
  await snapshot.seed("base\n");
  const file = join(root,"test.md");
  await writeFile(file,"base\n");
  return {root, snapshot, file};
}

test("a corrupt prepared file cannot displace the working copy on recovery",async t => {
  const {root,snapshot,file} = await fixture(t);
  const token = randomUUID();
  await writeFile(join(snapshot.dir,"pending.json"),JSON.stringify({
    token, acknowledged:false,path:file,expected:"base\n",next:"complete\n",resource:null,refs:snapshot.refs,
  }));
  await writeFile(join(snapshot.dir,token+".new"),"torn");
  const restarted = await DocumentHistory.load(root,"synthetic",() => new Date(0));
  await assert.rejects(restarted.recover(file,() => assert.fail("registry write")),/Corrupt prepared/);
  assert.equal(await readFile(file,"utf8"),"base\n");
});

test("private snapshots and pending journals never follow symlinks",async t => {
  const {root,snapshot,file} = await fixture(t);
  const id = snapshot.refs.base;
  const blob = join(snapshot.dir,snapshot.refs.revisions[0].blob+".md");
  await rm(blob);
  await symlink(file,blob);
  await assert.rejects(snapshot.text(id),{code:"ELOOP"});
  await symlink(file,join(snapshot.dir,"pending.json"));
  const restarted = await DocumentHistory.load(root,"synthetic",() => new Date(0));
  await assert.rejects(restarted.recover(file,() => assert.fail("registry write")),{code:"ELOOP"});
  assert.equal(await readFile(file,"utf8"),"base\n");
});
