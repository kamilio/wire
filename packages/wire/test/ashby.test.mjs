import test from "node:test";
import assert from "node:assert/strict";
import { ashby } from "../dist/adapters/ashby.js";
import { createCookiesCapability } from "wire-core";

test("scorecard sync preserves remote edits and never writes submitted or mismatched drafts", async () => {
  const url = "https://app.ashbyhq.com/interview-briefings/00000000-0000-4000-8000-000000000000";
  let file, submission = null, owner = "assignment", render = 0;
  const entries = ["Strengths", "Concerns"].map(path => ({field:{path,title:path,type:"String"},fieldValue:null}));
  const changes = [];
  const runtime = {cookies:{load:()=>[]}, filesystem:{readText:()=>file,writeText:(_,v)=>{file=v}}, http:{request:async (u,init)=>{
    assert.equal(new URL(u).origin,"https://app.ashbyhq.com");
    if (u.endsWith("/token")) return Response.json({token:"example"});
    const {query,variables} = JSON.parse(init.body);
    const form = {id:"render-"+render,sourceFormDefinitionId:"definition",fieldEntries:entries};
    if (query.includes("interviewBriefing(")) return Response.json({data:{interviewBriefing:{candidate:{name:"Example"},interviewerEvent:{id:owner,scorecardSubmission:submission}}}});
    if (query.includes("startScorecardForm(")) { render++; return Response.json({data:{startScorecardForm:form}}); }
    assert.match(query,/setFormValue\(/);
    changes.push(variables.path);
    entries.find(e=>e.field.path===variables.path).fieldValue={value:variables.v};
    return Response.json({data:{setFormValue:form}});
  }}};
  file=(await ashby(runtime,"template",url)).replace(/(<!-- ashby-field Strengths [^>]+-->)/,"$1\n\nExample observation.");
  entries[1].fieldValue={value:"Edited on website."};
  owner="different assignment";
  await assert.rejects(ashby(runtime,"sync","draft.md"),/does not belong/);
  owner="assignment";
  entries[0].fieldValue={value:"Simultaneous edit."};
  await assert.rejects(ashby(runtime,"sync","draft.md"),/Remote draft changed/);
  entries[0].fieldValue=null;
  submission={id:"submitted"};
  await assert.rejects(ashby(runtime,"sync","draft.md"),/No editable/);
  assert.deepEqual(changes,[]);
  submission=null;
  await ashby(runtime,"sync","draft.md");
  await ashby(runtime,"sync","draft.md");
  assert.deepEqual(changes,["Strengths"]);
  assert.match(file,/Edited on website\./);
});

test("Ashby login writes only to private user storage, even in a configured repo", async()=>{
  const writes=[];
  const store=createCookiesCapability({exists:async()=>false,writeText:async(path,_,mode)=>writes.push([path,mode])},()=>"/home/example",()=>"/repo");
  await store.save("ashby",[],{});
  assert.deepEqual(writes,[["/home/example/.wire/auth/ashby_cookies.txt",0o600]]);
});
