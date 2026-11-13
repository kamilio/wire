import { stripVTControlCharacters } from "node:util";
import type { FetchedDocument, RuntimeCapabilities } from "wire-core";

const loginRequired =
  "codesignal cookie authentication is missing or expired. Run `wire codesignal login` once; other commands reuse saved cookies.";

type Frame = {
  msg: string;
  id?: string;
  subs?: string[];
  collection?: string;
  fields?: { candidateId?: string };
  error?: { reason: string };
  result?: unknown;
};
type State = {
  sources?: {
    path: string;
    source: string;
    isHidden?: boolean;
    excluded?: boolean;
  }[];
  executionEnvironment?: string;
};
type Solution = {
  taskDoc: { _id: string; name: string };
  solutions: { finalState?: State; submission?: State };
  levelId?: string;
};
type RecordingEvent = {
  action: string;
  id: string;
  command: string;
  terminal?: { terminalContents: Record<string, string> };
  testResults: string;
};

async function session<T>(
  token: string,
  read: (
    user: string,
    method: <R>(name: string, ...params: unknown[]) => Promise<R>,
    interview: (id: string) => Promise<string | undefined>,
  ) => Promise<T>,
): Promise<T | null> {
  const socket = new WebSocket("wss://app.codesignal.com/websocket");
  let sequence = 0;
  const send = (value: object) => socket.send(JSON.stringify(value));
  const exchange = <R>(
    start: object,
    accept: (frame: Frame) => { value: R } | undefined,
  ) =>
    new Promise<R>((resolve, reject) => {
      const listeners = new AbortController();
      const finish = () => {
        clearTimeout(timer);
        listeners.abort();
      };
      const fail = () => {
        finish();
        reject(new Error("CodeSignal connection interrupted."));
      };
      const timer = setTimeout(fail, 30000);
      const options = { signal: listeners.signal };
      socket.addEventListener("error", fail, options);
      socket.addEventListener("close", fail, options);
      socket.addEventListener(
        "message",
        (event) => {
          try {
            const frame = JSON.parse(String(event.data)) as Frame;
            if (frame.msg === "ping") {
              send({ msg: "pong", id: frame.id });
              return;
            }
            const result = accept(frame);
            if (result) {
              finish();
              resolve(result.value);
            }
          } catch (error) {
            finish();
            reject(error);
          }
        },
        options,
      );
      if (socket.readyState === WebSocket.CONNECTING)
        socket.addEventListener("open", () => send(start), options);
      else send(start);
    });
  const call = (name: string, params: unknown[]) => {
    const id = String(++sequence);
    return exchange({ msg: "method", method: name, params, id }, (f) =>
      f.msg === "result" && f.id === id ? { value: f } : undefined,
    );
  };
  try {
    await exchange({ msg: "connect", version: "1", support: ["1"] }, (f) =>
      f.msg === "connected" ? { value: true } : undefined,
    );
    const login = await call("login", [{ resume: token }]);
    if (login.error) return null;
    return await read(
      (login.result as { id: string }).id,
      async <R>(name: string, ...params: unknown[]) => {
        const result = await call(name, params);
        if (result.error) throw new Error("CodeSignal: " + result.error.reason);
        return result.result as R;
      },
      async (interviewId) => {
        let candidate: string | undefined;
        for (const name of [
          "liveInterviews.byId",
          "liveInterviews.finished.byId",
        ]) {
          const id = String(++sequence);
          await exchange(
            { msg: "sub", name, params: [interviewId], id },
            (f) => {
              if (
                f.msg === "added" &&
                f.collection === "liveInterviews" &&
                f.id === interviewId
              )
                candidate = f.fields?.candidateId;
              if (f.msg === "nosub" && f.id === id)
                throw new Error("CodeSignal: " + f.error?.reason);
              return f.msg === "ready" && f.subs?.includes(id)
                ? { value: true }
                : undefined;
            },
          );
          if (candidate) break;
        }
        return candidate;
      },
    );
  } finally {
    socket.close();
  }
}

export const verifyCodeSignal = (token: string) =>
  session(token, async (user_id) => ({
    service: "codesignal" as const,
    identity: { user_id },
  }));

function block(value: string) {
  const fence = "`".repeat(
    Math.max(3, ...Array.from(value.matchAll(/`+/g), (m) => m[0].length + 1)),
  );
  return fence + "\n" + value + (value.endsWith("\n") ? "" : "\n") + fence;
}

function output(events: RecordingEvent[]) {
  let terminals: Record<string, string> = {};
  const runs: string[] = [];
  for (const e of events) {
    if (e.action === "setState" && e.terminal)
      terminals = { ...e.terminal.terminalContents };
    if (e.action === "terminalCreate" || e.action === "terminalReset")
      terminals[e.id] = "";
    if (e.action === "terminalDelete") delete terminals[e.id];
    if (e.action === "terminalWrite")
      terminals[e.id] = (terminals[e.id] ?? "") + e.command;
    if (e.action === "runResult" && e.testResults) {
      const { compilationLog, output } = JSON.parse(e.testResults);
      runs.push(
        ...[compilationLog, output].filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        ),
      );
    }
  }
  const clean = (v: string) =>
    stripVTControlCharacters(v)
      .replace(/\r\n/g, "\n")
      .replace(/[^\n]*\r/g, "")
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  return [
    ...Object.entries(terminals).map(
      ([id, v]) => "### Terminal " + id + "\n\n" + block(clean(v)),
    ),
    ...runs.map((v) => "### Run output\n\n" + block(clean(v))),
  ];
}

export function codeSignalInterviewId(url: string) {
  return /^https:\/\/app\.codesignal\.com\/live-interview\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/.exec(
    url,
  )?.[1];
}

export async function previewCodeSignal(
  runtime: RuntimeCapabilities,
  id: string,
): Promise<FetchedDocument> {
  const { token } = await runtime.cookies.metadata("codesignal");
  if (!token) throw new Error(loginRequired);
  const result = await session(token, async (user, method, interview) => {
    const replayUser = await interview(id);
    const questions = await method<
      (Solution | { type: "progressive"; taskLevels: Solution[] })[]
    >("liveInterviewService.getSolutions", id);
    const title = "CodeSignal interview " + id;
    const parts = ["# " + title];
    for (const question of questions) {
      for (const solution of "taskLevels" in question
        ? question.taskLevels
        : [question]) {
        const state =
          solution.solutions.finalState ?? solution.solutions.submission;
        parts.push("## " + solution.taskDoc.name);
        for (const file of state?.sources ?? [])
          if (!file.isHidden && !file.excluded)
            parts.push("### " + file.path, block(file.source));
        const data = await method<{
          recording: { events: RecordingEvent[] } | null;
        } | null>("taskRecordingService.getRecording", {
          taskId: solution.taskDoc._id,
          replayUserId: replayUser ?? user,
          context: { mode: "live-interview", liveInterviewId: id, role: null },
          taskLevelId: solution.levelId ?? null,
          executionEnvironment: state?.executionEnvironment,
          clientUserId: user,
        });
        const terminal = output(data?.recording?.events ?? []);
        parts.push(
          ...(terminal.length ? terminal : ["No recorded terminal output."]),
        );
      }
    }
    if (!questions.length) parts.push("No saved solutions.");
    return {
      title,
      markdown: parts.join("\n\n") + "\n",
      data: { url: "https://app.codesignal.com/live-interview/" + id },
    };
  });
  if (!result) throw new Error(loginRequired);
  return result;
}
