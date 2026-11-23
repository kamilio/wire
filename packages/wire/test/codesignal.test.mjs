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

test("edit uses the current revision and run records its actual verdict and output", async t => {
  const { editCodeSignal, runCodeSignal } = await import("../dist/adapters/codesignal.js");
  const calls = [], events = [], sockets = [];
  let code = "old 😀\n", revision = 7, active = true, missing = false, rpcError = false;
  const result = { verdict: "RUNTIME_ERROR", output: "", compilationLog: "AssertionError: expected 5\n", runTime: 12 };
  class Socket extends EventTarget {
    static CONNECTING = 0;
    readyState = 0;
    constructor(url) {
      super(); this.url = String(url); sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
    }
    close() { this.readyState = 3; }
    emit(frame) { queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }))); }
    send(json) {
      const f = JSON.parse(json);
      if (this.url.includes("app.codesignal.com")) {
        if (f.msg === "connect") return this.emit({ msg: "connected" });
        if (f.msg === "sub") {
          this.emit({ msg: "added", collection: "liveInterviews", id: "example", fields: { taskId: "current", status: active ? "pending" : "finished" } });
          return this.emit({ msg: "ready", subs: [f.id] });
        }
        calls.push(f.method);
        let value;
        if (f.method === "login") value = { id: "viewer" };
        else if (f.method === "liveInterviewService.getSolutions") value = [
          { taskDoc: { _id: "previous" } },
          { taskDoc: { _id: "current", persistentSessionSupport: true, filesystemSupport: true }, solutions: { finalState: { executionEnvironment: "py3" } } },
        ];
        else if (f.method === "persistentSession.maybeCreate") {
          assert.equal(f.params[0].taskId, "current");
          assert.deepEqual(f.params[2], { preferredEnvironment: "py3", language: null });
          value = { runnerId: "runner", clientToken: "secret", sessionKey: "session", executionEnvironment: "py3" };
        } else if (f.method === "liveRecordingService.getConnectionDetails") {
          assert.equal(f.params[0].sessionInfo.taskId, "current");
          value = { connectionUrl: "https://recording.codesignal.com/live", liveRecordingServerJWT: "secret" };
        } else {
          assert.equal(f.method, "taskService.getRunRawResult");
          assert.equal(f.params[0].sessionKey, "session");
          assert.deepEqual(f.params[0].submission.sources, []);
          assert.equal(events.at(-1).action, "runClicked");
          value = result;
        }
        return this.emit({ msg: "result", id: f.id, result: value });
      }
      if (f.messageType === "acknowledgement") return;
      if (this.url.includes("recording.codesignal.com")) {
        if (f.messageType === "initialization") {
          assert.equal(f.data.identifiers.loginToken, "valid");
          return this.emit({ messageType: "application-message", messageNumber: 0, data: { type: "init", message: { version: 3 } } });
        }
        assert.equal(f.data.data.version, 3);
        events.push(f.data.data.event);
        return this.emit({ messageType: "acknowledgement", messageNumber: f.messageNumber });
      }
      if (f.messageType === "initialization") return this.emit({ messageType: "handshake-completed" });
      if (f.data.kind === "open") return this.emit({ messageType: "application-message", messageNumber: 0, data: { kind: "ready", id: 0 } });
      const rpc = JSON.parse(f.data.content);
      calls.push(rpc.method);
      let value = null;
      if (rpc.method === "getFileServerState") value = missing ? null : { revisionVersion: revision, fileContent: code };
      else if (rpc.method === "fileCodeChanged") {
        assert.equal(rpc.params[0], "file:///usercode/FILESYSTEM/main.py");
        assert.equal(rpc.params[1], revision);
        const operations = rpc.params[2];
        if (code.length) assert.equal(operations.at(-1), -code.length);
        code = typeof operations[0] === "string" ? operations[0] : "";
        revision++;
      } else assert.equal(rpc.method, "saveUpdatedFiles");
      this.emit({ messageType: "application-message", messageNumber: rpc.id + 1, data: { kind: "data", id: 0, content: JSON.stringify({ id: rpc.id, ...(rpcError ? { error: { message: "Permission denied" } } : { result: value }) }) } });
    }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = original; });
  const runtime = { cookies: { metadata: async () => ({ token: "valid" }) } };
  const url = "https://app.codesignal.com/live-interview/example";
  await editCodeSignal(runtime, url, "main.py", "assert 2 + 3 == 5\n");
  assert.equal(code, "assert 2 + 3 == 5\n");
  assert.equal(calls.at(-1), "saveUpdatedFiles");
  const writes = calls.filter(v => v === "fileCodeChanged").length;
  await editCodeSignal(runtime, url, "main.py", code);
  assert.equal(calls.filter(v => v === "fileCodeChanged").length, writes);
  await editCodeSignal(runtime, url, "main.py", "");
  assert.equal(code, "");
  assert.deepEqual(await runCodeSignal(runtime, url), result);
  assert.equal(events.at(-1).action, "runResult");
  assert.deepEqual(JSON.parse(events.at(-1).testResults), result);
  await assert.rejects(editCodeSignal(runtime, url, "../other.py", ""), /relative/);
  missing = true;
  await assert.rejects(editCodeSignal(runtime, url, "main.py", ""), /file does not exist/);
  missing = false; rpcError = true;
  await assert.rejects(editCodeSignal(runtime, url, "main.py", ""), /Permission denied/);
  active = false;
  await assert.rejects(runCodeSignal(runtime, url), /not active/);
  assert.ok(sockets.every(s => s.readyState === 3));
});

test("CodeSignal commands expose edit input and preserve failing run output", async () => {
  const { createRoot } = await import("../dist/adapters/root.js");
  const { createFakeWire } = await import("./support/fake-wire.mjs");
  const received = [];
  const root = createRoot(createFakeWire(), ".", {}, undefined, { allowPaste: false,
    codeSignalEdit: async (...args) => { received.push(args); return { url: args[0], path: args[1] }; },
    codeSignalRun: async url => { received.push([url]); return { verdict: "WRONG_ANSWER", compilationLog: "", output: "E   assert 5 == 6\n" }; },
  });
  const commands = root.children.find(c => c.name === "codesignal").children;
  const edit = commands.find(c => c.name === "edit"), run = commands.find(c => c.name === "run");
  const edited = await edit.handler({ params: { url: "interview", path: "main.py", file: "local.py" } });
  assert.equal(edit.render.markdown(edited), "Updated main.py");
  const result = await run.handler({ params: { url: "interview" } });
  assert.equal(run.render.markdown(result), "Verdict: WRONG_ANSWER\nE   assert 5 == 6\n");
  assert.equal(run.render.json(result).verdict, "WRONG_ANSWER");
  assert.deepEqual(received, [["interview", "main.py", "local.py"], ["interview"]]);
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const cli = new URL("../bin/wire.mjs", import.meta.url).pathname;
  const exec = promisify(execFile);
  const help = await exec(process.execPath, [cli, "codesignal", "--help"]);
  assert.match(help.stdout, /edit <url> <path> --file/);
  assert.match(help.stdout, /run <url>/);
  for (const args of [["edit"], ["edit", "url"], ["run"], ["run", "url", "extra"]]) {
    await assert.rejects(exec(process.execPath, [cli, "codesignal", ...args]), e => {
      assert.match(e.stdout + e.stderr, /Missing required argument|Too many arguments/i);
      return true;
    });
  }
});
