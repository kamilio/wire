import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { initializeWire } from "wire-core";

const exec = promisify(execFile);
const entry = new URL("../bin/wire.mjs",import.meta.url).pathname;
const executable = new URL("../dist/executable.js",import.meta.url).href;
const root = new URL("../dist/adapters/root.js",import.meta.url).href;
const core = new URL("../../wire-core/dist/index.js",import.meta.url).href;
const merge = new URL("../../provider-google-docs/dist/doc-blocks.js",import.meta.url).href;

// Use the real wire executable, command parser, filesystem, history, and safe shell.
// Only replace its provider composition; each invocation opens the workspace afresh.
for (const backend of ["files","sqlite"]) {
  test(backend + ": the CLI reconciles a stale editor save and a pending shell draft without touching the remote",async t=>{
    await mkdir("out",{recursive:true});
    const path=await mkdtemp(resolve("out/editor-shell-"));
    t.after(()=>rm(path,{recursive:true,force:true}));
    await initializeWire(path,backend,backend==="sqlite"?"registry.sqlite3":"records");
    const fake=join(path,"provider.mjs"), remote=join(path,"remote"), file=join(path,"note.md");
    await writeFile(fake,`
import {composeWire,configuredWireRoot,initializeWire,openWireRegistry,wireRelativePath} from ${JSON.stringify(core)};
import {createRoot} from ${JSON.stringify(root)};
import {mergeDocBlocks} from ${JSON.stringify(merge)};
import {readFile,writeFile,stat} from "node:fs/promises";
import {join} from "node:path";
export function createExecutableRoot(_env,cwd) {
  const remote=join(cwd,"remote");
  const fetch=async()=>{const markdown=await readFile(remote,"utf8");return {title:"Note",markdown,data:{markdown}};};
  return createRoot(composeWire({home:cwd,fetchInput:{},initialization:{backend:"files",registryPath:"records"},
    catalog:[{name:"google-docs",matches:()=>true,parse:u=>({service:"google-docs",type:"document",identifier:u.pathname}),fetch,
      synchronize:async(_input,_url,_source,base,local,_path,observe,strict)=>{
        const seen=await fetch(); await observe(seen);
        const target=mergeDocBlocks(base.markdown,local,seen.markdown);
        if(target!==seen.markdown) { if(!strict) throw Error("Expected conditional write"); await writeFile(remote,target); }
        return {...await fetch(),wroteRemote:target!==seen.markdown}; }}],
    workspace:{configuredRoot:configuredWireRoot,initialize:initializeWire,openRegistry:openWireRegistry,relativePath:wireRelativePath},
    filesystem:{exists:p=>stat(p).then(()=>true,()=>false),isFile:p=>stat(p).then(s=>s.isFile(),()=>false),readText:p=>readFile(p,"utf8"),writeText:(p,s)=>writeFile(p,s)},
    now:()=>new Date(0),open:async()=>{}}),cwd);
}
`);
    const loader=join(path,"loader.mjs");
    await writeFile(loader,`export async function resolve(s,c,n){ const r=await n(s,c); return r.url===${JSON.stringify(executable)}?{url:${JSON.stringify(new URL("file:"+fake).href)},shortCircuit:true}:r; }`);
    const cli=async(...args)=>(await exec(process.execPath,["--experimental-loader",loader,entry,...args],{
      cwd:path,env:{HOME:path,TMPDIR:path,XDG_CONFIG_HOME:path,XDG_DATA_HOME:path,NO_COLOR:"1",NODE_NO_WARNINGS:"1"},timeout:30000,
    })).stdout;
    const url="https://docs.google.com/document/d/fixture/edit";
    const a="Title\nMiddle\nEnd\n"; await writeFile(remote,a);
    await cli("attach",url,"--editor-receipts");
    const old=await readFile(file,"utf8");
    await cli("shell",file,"sed -i 's/Middle/Shell middle/' document.md");
    await writeFile(file,old.replace("Title","Editor title"));
    await assert.rejects(cli("sync",file),e=>/conflict/i.test(e.stdout+e.stderr));
    const saved=JSON.parse(await cli("conflicts",file,"--output","json"));
    assert.ok(saved.editor && saved.shell && saved.editor!==saved.shell);
    assert.match(await cli("diff",file,"--from","editor","--to","shell"),/Shell middle/);
    await writeFile(file,(await readFile(file,"utf8")).replace("Middle","Shell middle"));
    await cli("resolve",file,"working");
    assert.equal(await readFile(remote,"utf8"),a);
    await writeFile(remote,a+"Remote tail\n");
    await cli("sync",file);
    assert.equal(await readFile(remote,"utf8"),"Editor title\nShell middle\nEnd\nRemote tail\n");

    const start=await readFile(file,"utf8");
    await cli("shell",file,"sed -i 's/End/Shell ending/' document.md");
    await writeFile(file,start.replace("End","Editor ending"));
    assert.match(await cli("status",file),/conflict/);
    await cli("resolve",file,"shell");
    assert.doesNotMatch(await readFile(remote,"utf8"),/ending/);
    await cli("sync",file);
    assert.match(await readFile(remote,"utf8"),/Shell ending/);
    assert.doesNotMatch(await readFile(remote,"utf8"),/Editor ending/);
  });
}
