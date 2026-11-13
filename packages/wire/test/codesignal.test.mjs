import assert from "node:assert/strict";
import { test } from "node:test";
import { codeSignalInterviewId, previewCodeSignal } from "../dist/adapters/codesignal.js";
import { composeAuth } from "../dist/auth.js";

test("preview reads saved files and reconstructs recorded terminal and run results without joining", async t => {
  const calls = [];
  class Socket extends EventTarget {
    static CONNECTING = 0;
    readyState = 0;
    constructor(url) {
      super();
      assert.equal(url, "wss://app.codesignal.com/websocket");
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
    }
    close() { this.readyState = 3; }
    send(json) {
      const {msg, method, params, id, name} = JSON.parse(json);
      const emit = frame => queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {data:JSON.stringify(frame)})));
      if (msg === "connect") return emit({msg:"connected"});
      if (msg === "sub") {
        assert.equal(name, "liveInterviews.byId");
        emit({msg:"added", collection:"liveInterviews", id:"example", fields:{candidateId:"candidate"}});
        return emit({msg:"ready",subs:[id]});
      }
      calls.push(method);
      let result;
      if (method === "login") {
        if (params[0].resume !== "valid") return emit({msg:"result",id,error:{reason:"expired"}});
        result = {id:"viewer"};
      } else if (method === "liveInterviewService.getSolutions") {
        result = [{taskDoc:{_id:"task",name:"Question"},solutions:{finalState:{sources:[{path:"main.py",source:"print('ok')"},{path:"secret",source:"hidden",isHidden:true}]}}}];
      } else {
        assert.equal(method, "taskRecordingService.getRecording");
        assert.equal(params[0].replayUserId, "candidate");
        result = {recording:{events:[
          {action:"terminalWrite",id:0,command:"discard"},
          {action:"setState",terminal:{terminalContents:{0:"$ "}}},
          {action:"terminalWrite",id:0,command:"echo ok\r\nok\r\n"},
          {action:"runResult",testResults:JSON.stringify({output:"program output\n"})},
        ]}};
      }
      emit({msg:"result",id,result});
    }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = original; });
  const runtime = {cookies:{metadata:async()=>({token:"valid"})}};
  const {markdown} = await previewCodeSignal(runtime, "example");
  assert.match(markdown, /main\.py[\s\S]+print\('ok'\)/);
  assert.match(markdown, /Terminal 0\n\n```\n\$ echo ok\nok\n```/);
  assert.match(markdown, /Run output\n\n```\nprogram output\n```/);
  assert.doesNotMatch(markdown, /hidden|discard/);
  assert.deepEqual(calls, ["login","liveInterviewService.getSolutions","taskRecordingService.getRecording"]);
  await assert.rejects(previewCodeSignal({cookies:{metadata:async()=>({token:"expired"})}}, "example"), /wire codesignal login/);
  const auth = composeAuth(runtime, {}, async (_env, extraction) => {
    assert.equal(extraction.startUrl,"https://app.codesignal.com/");
    assert.match(extraction.metadataExpression,/Meteor\.loginToken/);
    assert.equal(await extraction.verify([], {token:"expired"}), false);
    assert.equal(await extraction.verify([], {}), false);
    throw new Error("end of capture");
  });
  await assert.rejects(auth.extractCodeSignal(), /end of capture/);
  assert.equal(codeSignalInterviewId("https://app.codesignal.com/live-interview/example?tab=1"), "example");
  assert.equal(codeSignalInterviewId("https://app.codesignal.com.example.org/live-interview/example"), undefined);
});
