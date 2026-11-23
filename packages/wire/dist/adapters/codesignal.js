import { randomUUID } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
const loginRequired = "codesignal cookie authentication is missing or expired. Run `wire codesignal login` once; other commands reuse saved cookies.";
async function session(token, read) {
    const socket = new WebSocket("wss://app.codesignal.com/websocket");
    let sequence = 0;
    const send = (value) => socket.send(JSON.stringify(value));
    const exchange = (start, accept) => new Promise((resolve, reject) => {
        const listeners = new AbortController();
        const finish = () => {
            clearTimeout(timer);
            listeners.abort();
        };
        const fail = () => {
            finish();
            reject(new Error("CodeSignal connection interrupted."));
        };
        const timer = setTimeout(fail, 60000);
        const options = { signal: listeners.signal };
        socket.addEventListener("error", fail, options);
        socket.addEventListener("close", fail, options);
        socket.addEventListener("message", (event) => {
            try {
                const frame = JSON.parse(String(event.data));
                if (frame.msg === "ping") {
                    send({ msg: "pong", id: frame.id });
                    return;
                }
                const result = accept(frame);
                if (result) {
                    finish();
                    resolve(result.value);
                }
            }
            catch (error) {
                finish();
                reject(error);
            }
        }, options);
        if (socket.readyState === WebSocket.CONNECTING)
            socket.addEventListener("open", () => send(start), options);
        else
            send(start);
    });
    const call = (name, params) => {
        const id = String(++sequence);
        return exchange({ msg: "method", method: name, params, id }, (f) => f.msg === "result" && f.id === id ? { value: f } : undefined);
    };
    try {
        await exchange({ msg: "connect", version: "1", support: ["1"] }, (f) => f.msg === "connected" ? { value: true } : undefined);
        const login = await call("login", [{ resume: token }]);
        if (login.error)
            return null;
        return await read(login.result.id, async (name, ...params) => {
            const result = await call(name, params);
            if (result.error)
                throw new Error("CodeSignal: " + result.error.reason);
            return result.result;
        }, async (interviewId) => {
            let current;
            for (const name of [
                "liveInterviews.byId",
                "liveInterviews.finished.byId",
            ]) {
                const id = String(++sequence);
                await exchange({ msg: "sub", name, params: [interviewId], id }, (f) => {
                    if (f.msg === "added" &&
                        f.collection === "liveInterviews" &&
                        f.id === interviewId)
                        current = f.fields;
                    if (f.msg === "nosub" && f.id === id)
                        throw new Error("CodeSignal: " + f.error?.reason);
                    return f.msg === "ready" && f.subs?.includes(id)
                        ? { value: true }
                        : undefined;
                });
                if (current)
                    break;
            }
            return current;
        });
    }
    finally {
        socket.close();
    }
}
export const verifyCodeSignal = (token) => session(token, async (user_id) => ({
    service: "codesignal",
    identity: { user_id },
}));
function block(value) {
    const fence = "`".repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), (m) => m[0].length + 1)));
    return fence + "\n" + value + (value.endsWith("\n") ? "" : "\n") + fence;
}
function output(events) {
    let terminals = {};
    const runs = [];
    for (const e of events) {
        if (e.action === "setState" && e.terminal)
            terminals = { ...e.terminal.terminalContents };
        if (e.action === "terminalCreate" || e.action === "terminalReset")
            terminals[e.id] = "";
        if (e.action === "terminalDelete")
            delete terminals[e.id];
        if (e.action === "terminalWrite")
            terminals[e.id] = (terminals[e.id] ?? "") + e.command;
        if (e.action === "runResult" && e.testResults) {
            const { compilationLog, output } = JSON.parse(e.testResults);
            runs.push(...[compilationLog, output].filter((v) => typeof v === "string" && v.length > 0));
        }
    }
    const clean = (v) => stripVTControlCharacters(v)
        .replace(/\r\n/g, "\n")
        .replace(/[^\n]*\r/g, "")
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    return [
        ...Object.entries(terminals).map(([id, v]) => "### Terminal " + id + "\n\n" + block(clean(v))),
        ...runs.map((v) => "### Run output\n\n" + block(clean(v))),
    ];
}
export function codeSignalInterviewId(url) {
    return /^https:\/\/app\.codesignal\.com\/live-interview\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/.exec(url)?.[1];
}
export async function previewCodeSignal(runtime, id) {
    const { token } = await runtime.cookies.metadata("codesignal");
    if (!token)
        throw new Error(loginRequired);
    const result = await session(token, async (user, method, interview) => {
        const replayUser = (await interview(id))?.candidateId;
        const questions = await method("liveInterviewService.getSolutions", id);
        const title = "CodeSignal interview " + id;
        const parts = ["# " + title];
        for (const question of questions) {
            for (const solution of "taskLevels" in question
                ? question.taskLevels
                : [question]) {
                const state = solution.solutions.finalState ?? solution.solutions.submission;
                parts.push("## " + solution.taskDoc.name);
                for (const file of state?.sources ?? [])
                    if (!file.isHidden && !file.excluded)
                        parts.push("### " + file.path, block(file.source));
                const data = await method("taskRecordingService.getRecording", {
                    taskId: solution.taskDoc._id,
                    replayUserId: replayUser ?? user,
                    context: { mode: "live-interview", liveInterviewId: id, role: null },
                    taskLevelId: solution.levelId ?? null,
                    executionEnvironment: state?.executionEnvironment,
                    clientUserId: user,
                });
                const terminal = output(data?.recording?.events ?? []);
                parts.push(...(terminal.length ? terminal : ["No recorded terminal output."]));
            }
        }
        if (!questions.length)
            parts.push("No saved solutions.");
        return {
            title,
            markdown: parts.join("\n\n") + "\n",
            data: { url: "https://app.codesignal.com/live-interview/" + id },
        };
    });
    if (!result)
        throw new Error(loginRequired);
    return result;
}
async function collaboration(runner, work) {
    const socket = new WebSocket(`wss://${runner.runnerId}.ide.codesignal.com/services-lc/websocket?token=${runner.clientToken}`);
    const connectionId = randomUUID();
    let messageNumber = 0;
    let requestId = 0;
    const pending = new Map();
    const send = (value) => socket.send(JSON.stringify({ connectionId, ...value }));
    const data = (value) => send({ messageType: "application-message", messageNumber: messageNumber++, data: value });
    let ready;
    let failed;
    const connected = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
    const fail = () => {
        const error = new Error("CodeSignal editor connection interrupted.");
        failed(error);
        for (const request of pending.values())
            request.reject(error);
    };
    const timer = setTimeout(fail, 60000);
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
    socket.addEventListener("open", () => send({ messageType: "initialization", data: null }));
    socket.addEventListener("message", event => {
        const frame = JSON.parse(String(event.data));
        if (frame.messageType === "handshake-completed")
            data({ kind: "open", id: 0, path: "/services/collaboration" });
        if (frame.messageType !== "application-message")
            return;
        send({ messageType: "acknowledgement", messageNumber: frame.messageNumber });
        if (frame.data.kind === "ready")
            ready();
        if (frame.data.kind === "data") {
            const response = JSON.parse(frame.data.content);
            const request = pending.get(response.id);
            if (!request)
                return;
            pending.delete(response.id);
            if (response.error)
                request.reject(new Error("CodeSignal: " + response.error.message));
            else
                request.resolve(response.result);
        }
    });
    try {
        await connected;
        return await work((method, ...params) => new Promise((resolve, reject) => {
            const id = requestId++;
            pending.set(id, { resolve, reject });
            data({ kind: "data", id: 0, content: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
        }));
    }
    finally {
        clearTimeout(timer);
        socket.removeEventListener("close", fail);
        socket.close();
    }
}
async function editor(runtime, url, work) {
    const id = codeSignalInterviewId(url);
    if (!id)
        throw new Error("Expected a CodeSignal live-interview URL.");
    const { token } = await runtime.cookies.metadata("codesignal");
    if (!token)
        throw new Error(loginRequired);
    const result = await session(token, async (user, method, interview) => {
        const current = await interview(id);
        if (!current || current.status === "finished")
            throw new Error("CodeSignal interview is not active.");
        const solutions = await method("liveInterviewService.getSolutions", id);
        const solution = solutions.find(s => s.taskDoc?._id === current.taskId);
        if (!solution?.taskDoc.persistentSessionSupport || !solution.taskDoc.filesystemSupport)
            throw new Error("CodeSignal editing and running require a filesystem coding question.");
        const state = solution.solutions.finalState ?? solution.solutions.submission;
        const runner = await method("persistentSession.maybeCreate", { taskId: current.taskId }, { mode: "live-interview", liveInterviewId: id, role: "interviewer" }, { preferredEnvironment: state.executionEnvironment, language: null }, null);
        return collaboration(runner, call => work(runner, current.taskId, user, method, call));
    });
    if (result === null)
        throw new Error(loginRequired);
    return result;
}
export async function editCodeSignal(runtime, url, path, source) {
    if (!path || path.startsWith("/") || path.split("/").some(p => p === ".." || p === "." || p === ""))
        throw new Error("Expected a file path relative to the CodeSignal project.");
    return editor(runtime, url, async (_runner, _taskId, _user, _method, call) => {
        const uri = "file:///usercode/FILESYSTEM/" + path.split("/").map(encodeURIComponent).join("/");
        const state = await call("getFileServerState", uri, "utf8");
        if (!state)
            throw new Error("CodeSignal file does not exist: " + path);
        if (state.fileContent !== source) {
            const operations = [];
            if (source.length)
                operations.push(source);
            if (state.fileContent.length)
                operations.push(-state.fileContent.length);
            await call("fileCodeChanged", uri, state.revisionVersion, operations);
            await call("saveUpdatedFiles");
        }
        return { url, path };
    });
}
async function recordRun(runtime, url, runner, taskId, user, method, execute) {
    const id = codeSignalInterviewId(url);
    const { connectionUrl, liveRecordingServerJWT } = await method("liveRecordingService.getConnectionDetails", {
        sessionInfo: { liveInterviewId: id, taskId, mode: 0 }, language: runner.executionEnvironment, executionEnvironment: runner.executionEnvironment,
    });
    const { token } = await runtime.cookies.metadata("codesignal");
    const endpoint = new URL(connectionUrl + "/websocket");
    endpoint.protocol = "wss:";
    const socket = new WebSocket(endpoint);
    const connectionId = randomUUID();
    const signature = randomUUID();
    const executionId = `${Date.now()}-${user}-${taskId}`;
    let version;
    let number = 0;
    const waiting = new Map();
    const initialized = new Promise((resolve, reject) => waiting.set(-1, { resolve, reject }));
    const send = (frame) => socket.send(JSON.stringify({ connectionId, ...frame }));
    const fail = () => { for (const pending of waiting.values())
        pending.reject(new Error("CodeSignal recording connection interrupted.")); };
    const timer = setTimeout(fail, 60000);
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
    socket.addEventListener("open", () => send({ messageType: "initialization", data: {
            identifiers: { loginToken: token, localId: "user@" + user },
            options: { mode: "live-interview", liveInterviewId: id, role: null, taskId, executionEnvironment: runner.executionEnvironment,
                language: runner.executionEnvironment, signature, sessionId: id + "-" + taskId, liveRecordingServerJWT },
        } }));
    socket.addEventListener("message", event => {
        const frame = JSON.parse(String(event.data));
        if (frame.messageType === "acknowledgement") {
            waiting.get(frame.messageNumber)?.resolve();
            waiting.delete(frame.messageNumber);
        }
        if (frame.messageType === "application-message") {
            send({ messageType: "acknowledgement", messageNumber: frame.messageNumber });
            if (frame.data.type === "init") {
                version = frame.data.message.version;
                waiting.get(-1).resolve();
                waiting.delete(-1);
            }
        }
    });
    const record = (event) => new Promise((resolve, reject) => {
        const messageNumber = number++;
        waiting.set(messageNumber, { resolve, reject });
        send({ messageType: "application-message", messageNumber, data: { type: "event", data: { signature, version, eventNumber: number, event } } });
    });
    try {
        await initialized;
        await record({ action: "runClicked", onlyCustomTests: false, runMode: "raw", executionId });
        const result = await execute(executionId);
        await record({ action: "runResult", testResults: JSON.stringify(result) });
        return result;
    }
    finally {
        clearTimeout(timer);
        socket.removeEventListener("close", fail);
        socket.close();
    }
}
export async function runCodeSignal(runtime, url) {
    return editor(runtime, url, async (runner, taskId, user, method, call) => {
        await call("saveUpdatedFiles");
        return recordRun(runtime, url, runner, taskId, user, method, executionId => method("taskService.getRunRawResult", {
            taskId,
            submission: { processedSources: null, sources: [], recordingKey: taskId, executionEnvironment: runner.executionEnvironment, executionEnvironmentTimeLimit: 30000 },
            context: { mode: "live-interview", liveInterviewId: codeSignalInterviewId(url), role: "interviewer" },
            sessionKey: runner.sessionKey,
            executionId,
        }));
    });
}
//# sourceMappingURL=codesignal.js.map