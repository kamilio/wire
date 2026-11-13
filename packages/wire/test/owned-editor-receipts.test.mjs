import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { composeWire, configuredWireRoot, initializeWire, openWireRegistry, synchronizeSource, wireRelativePath } from "wire-core";

const cli = new URL("../bin/wire.mjs",import.meta.url).pathname;
const run = promisify(execFile);
for (const backend of ["files","sqlite"]) {
  test(backend + ": only the adopting owner gets the raw editor file; the generic CLI cannot reclaim its document", async t => {
    const out=resolve("out"); await mkdir(out,{recursive:true}); const path=await mkdtemp(join(out,"wire-owned-"));
    t.after(()=>rm(path,{recursive:true,force:true}));
    const registryPath=backend==="files"?"records":"registry.sqlite3";
    await initializeWire(path,backend,registryPath);
    const file=join(path,"note.md"), url="https://docs.google.com/document/d/synthetic-owned/edit";
    let remote="First paragraph\n", seen;
    await writeFile(file,remote);
    const owned={ name:"google-docs",owner:"fixture-owner",supportsEditorReceipts:true,
      matches:()=>true,parse:()=>({service:"google-docs",type:"document",identifier:"synthetic-owned",document_id:"synthetic-owned"}),
      fetch:async()=>({title:"Note",markdown:remote,data:{wire_owner:"fixture-owner",markdown:remote}}),
      synchronize:async(_i,_url,_s,_base,markdown,_path,observe,strict,expectedFile)=>{
        seen={markdown,expectedFile,strict};
        assert.equal(expectedFile,await readFile(file,"utf8"));
        await observe(await owned.fetch());
        remote=markdown;
        return {...await owned.fetch(),wroteRemote:true};
      },
    };
    const make = service => composeWire({ home:path,fetchInput:{},catalog:[service],initialization:{backend,registryPath},
      workspace:{configuredRoot:configuredWireRoot,initialize:initializeWire,openRegistry:openWireRegistry,relativePath:wireRelativePath},
      filesystem:{exists:p=>stat(p).then(()=>true,()=>false),isFile:p=>stat(p).then(s=>s.isFile(),()=>false),readText:p=>readFile(p,"utf8"),writeText:(p,s)=>writeFile(p,s)},
      now:()=>new Date(0),open:async()=>{},
    });
    await assert.rejects(make({...owned,supportsEditorReceipts:false}).adopt(url,file,true),/explicitly support/);
    await assert.rejects(make(owned).attach(url,path,true),/adopt/);
    const wire=make(owned);
    await wire.adopt(url,file,true);
    const raw=(await readFile(file,"utf8")).replace("First","Second"); await writeFile(file,raw);
    await wire.sync(file,path);
    assert.deepEqual(seen,{markdown:"Second paragraph\n",expectedFile:raw,strict:true});
    assert.equal(remote,"Second paragraph\n");
    await assert.rejects(make({...owned,owner:"another-owner"}).sync(file,path),/different sync owner/);
    const output=await run(process.execPath,[cli,"attach",url+"?tab=t.0","--editor-receipts"],{
      cwd:path,env:{HOME:path,TMPDIR:path,XDG_CONFIG_HOME:path,XDG_DATA_HOME:path,NO_COLOR:"1",NODE_NO_WARNINGS:"1"},
    }).then(()=>assert.fail("generic provider claimed an owned tab"),e=>e.stdout+e.stderr);
    assert.match(output,/different sync owner/);
    await assert.rejects(make({...owned,fetch:async()=>({title:"Note",markdown:remote,data:{}})}).adopt(url,file,true),/without its registered owner/);
  });
}

test("raw editor comparison input never enters a generic or non-Docs service",async()=>{
  for (const [name,owner,supportsEditorReceipts] of [["google-docs",undefined,true],["notion","fixture",true],["google-docs","fixture",false]]) {
    const s={name,owner,supportsEditorReceipts,matches:()=>true,parse:()=>({service:name,type:"document",identifier:"test"}),
      synchronize:async(...args)=>{ assert.equal(args[4],"clean"); assert.equal(args[8],undefined); return {title:"note",markdown:"clean",data:{}}; } };
    await synchronizeSource({}, "https://example.test", [s], {}, "clean", "note.md", undefined, true, "clean\n<!-- wire-editor-basis:v1:local -->");
  }
});
