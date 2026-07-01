import { spawn } from "node:child_process";
import { stdin, stderr } from "node:process";
import { createInterface } from "node:readline/promises";
import { mkdir } from "node:fs/promises";

import type { Cookie } from "../ports.js";
import type { NodeEnvironment } from "./node.js";

function environmentValue(environment: NodeEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function chromeUserDataDir(environment: NodeEnvironment): string {
  return `${environmentValue(environment, "HOME")}/Library/Application Support/Wire/Chrome`;
}

export async function chromeLaunchArguments(environment: NodeEnvironment, startUrl: string): Promise<readonly string[]> {
  const userDataDir = chromeUserDataDir(environment);
  return Object.freeze([
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    startUrl,
  ]);
}

interface ChromeCookie {
  readonly domain: string;
  readonly expires: number;
  readonly httpOnly: boolean;
  readonly name: string;
  readonly path: string;
  readonly secure: boolean;
  readonly value: string;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface PendingEvent {
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (reason: unknown) => void;
}

class ChromeConnection {
  readonly socket: WebSocket;
  readonly pending = new Map<number, PendingRequest>();
  readonly events = new Map<string, PendingEvent[]>();
  nextId = 1;
  closed = false;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    const rejectPending = () => {
      this.closed = true;
      const error = new Error("Chrome window closed before login completed");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      for (const events of this.events.values()) for (const event of events) event.reject(error);
      this.events.clear();
    };
    this.socket.addEventListener("close", rejectPending, { once: true });
    this.socket.addEventListener("error", rejectPending, { once: true });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString()) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };
      if (message.id === undefined) {
        if (message.method !== undefined) {
          const events = this.events.get(message.method);
          if (events !== undefined) {
            const pending = events.shift()!;
            if (events.length === 0) this.events.delete(message.method);
            pending.resolve(message.params!);
          }
        }
        return;
      }
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error === undefined) pending.resolve(message.result);
      else pending.reject(new Error(JSON.stringify(message.error)));
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", (event) => reject(event), { once: true });
    });
  }

  request(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  event(method: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      const events = this.events.get(method) ?? [];
      events.push({ resolve, reject });
      this.events.set(method, events);
    });
  }

  close(): void {
    this.socket.close();
  }
}

function devtoolsUrl(stderr: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let contents = "";
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk: string) => {
      contents += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(contents);
      if (match !== null) resolve(match[1]!);
    });
    stderr.on("end", () => reject(new Error(contents)));
  });
}

async function closeChrome(chrome: ReturnType<typeof spawn>, connection: ChromeConnection, pageConnection?: ChromeConnection): Promise<void> {
  const closed = new Promise((resolve) => chrome.once("exit", resolve));
  if (pageConnection !== undefined) pageConnection.close();
  connection.close();
  process.kill(-chrome.pid!, "SIGTERM");
  await closed;
}

async function pageDevtoolsUrl(browserUrl: string, domains: readonly string[]): Promise<string> {
  const endpoint = new URL(browserUrl);
  endpoint.protocol = "http:";
  endpoint.pathname = "/json/list";
  endpoint.search = "";
  endpoint.hash = "";
  const targets = await (await fetch(endpoint)).json() as readonly { readonly type: string; readonly url: string; readonly webSocketDebuggerUrl: string }[];
  return targets.find((target) => target.type === "page" && domains.some((domain) => new URL(target.url).hostname === domain || new URL(target.url).hostname.endsWith(`.${domain}`)))!.webSocketDebuggerUrl;
}

async function chatgptBrowserMetadata(pageConnection: ChromeConnection): Promise<Readonly<Record<string, string>> | null> {
  const evaluation = await pageConnection.request("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      (async () => {
        if (location.hostname !== "chatgpt.com") {
          resolve({ ok: false });
          return;
        }
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const text = await response.text();
        if (!text.startsWith("{")) {
          resolve({ ok: false });
          return;
        }
        const session = JSON.parse(text);
        if (!("account" in session) || !("id" in session.account) || !("accessToken" in session) || "error" in session) {
          resolve({ ok: false });
          return;
        }
        const backend = await fetch("/backend-api/conversations?offset=0&limit=1&order=updated&is_archived=false&is_starred=false", {
          cache: "no-store",
          headers: {
            authorization: \`Bearer \${session.accessToken}\`,
            "chatgpt-account-id": session.account.id
          }
        });
        resolve({ ok: backend.ok, account_id: session.account.id });
      })().catch(() => resolve({ ok: false }));
    })`,
    awaitPromise: true,
    returnByValue: true,
  }) as { result: { value?: { ok?: boolean; account_id?: string } } };
  const value = evaluation.result.value!;
  if (value.ok !== true) return null;
  return Object.freeze({ account_id: value.account_id! });
}

async function chatgptChallengeUrl(pageConnection: ChromeConnection): Promise<string | null> {
  const evaluation = await pageConnection.request("Runtime.evaluate", {
    expression: `(() => ({ href: location.href, title: document.title, text: document.body.innerText }))()`,
    returnByValue: true,
  }) as { result: { value?: { href: string; title: string; text: string } } };
  const value = evaluation.result.value!;
  const pageText = `${value.href}\n${value.title}\n${value.text}`;
  if (/cdn-cgi\/challenge-platform|cf_chl|Just a moment|Verify you are human|Cloudflare/i.test(pageText)) return value.href;
  return null;
}

function chromeCookies(values: readonly ChromeCookie[], domains: readonly string[]): readonly Cookie[] {
  return Object.freeze(values.filter((cookie) => domains.some((domain) => cookie.domain === domain || cookie.domain.endsWith(`.${domain}`))).map((cookie) => Object.freeze({
    domain: cookie.domain,
    includeSubdomains: cookie.domain.startsWith("."),
    path: cookie.path,
    secure: cookie.secure,
    expires: cookie.expires < 0 ? 0 : Math.floor(cookie.expires),
    name: cookie.name,
    value: cookie.value,
    httpOnly: cookie.httpOnly,
  })));
}

export interface ChromeCookieExtraction {
  readonly service: string;
  readonly startUrl: string;
  readonly domains: readonly string[];
  readonly ready: (cookies: readonly Cookie[]) => boolean;
  readonly metadataExpression?: string;
  readonly verify: (cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>) => Promise<boolean>;
}

export interface ChromeCookieResult {
  readonly cookies: readonly Cookie[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly manual?: true;
}

async function confirmSaveLogin(): Promise<boolean> {
  const terminal = createInterface({ input: stdin, output: stderr });
  const answer = await terminal.question("\nDo you want to save login? [y/N] ");
  terminal.close();
  return /^(y|yes)$/i.test(answer.trim());
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function extractChromeCookies(environment: NodeEnvironment, extraction: ChromeCookieExtraction): Promise<ChromeCookieResult> {
  const profile = chromeUserDataDir(environment);
  await mkdir(profile, { recursive: true });
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [...await chromeLaunchArguments(environment, extraction.startUrl)], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let interrupted = false;
  let interrupting = false;
  let interruptResult: ChromeCookieResult | null | undefined;
  let interruptResolve: () => void = () => {};
  const interruptPromise = new Promise<void>((resolve) => { interruptResolve = resolve; });
  let captureCookies: (() => Promise<ChromeCookieResult>) | undefined;
  const captureInterrupt = async () => {
    if (!interrupted || interrupting || interruptResult !== undefined || captureCookies === undefined) return;
    interrupting = true;
    const result = await captureCookies();
    const save = await confirmSaveLogin();
    interruptResult = save ? Object.freeze({ cookies: result.cookies, metadata: result.metadata, manual: true }) : null;
    interruptResolve();
  };
  const interrupt = () => {
    interrupted = true;
    void captureInterrupt();
  };
  process.on("SIGINT", interrupt);
  const browserUrl = await devtoolsUrl(chrome.stderr!);
  const connection = new ChromeConnection(browserUrl);
  await connection.opened();
  const pageConnection = extraction.metadataExpression === undefined && extraction.service !== "chatgpt" ? undefined : new ChromeConnection(await pageDevtoolsUrl(browserUrl, extraction.domains));
  if (pageConnection !== undefined) await pageConnection.opened();
  if (pageConnection !== undefined) await Promise.race([sleep(2000), interruptPromise]);
  const currentResult = async (): Promise<ChromeCookieResult> => {
    const result = await connection.request("Storage.getCookies") as { cookies: readonly ChromeCookie[] };
    const cookies = chromeCookies(result.cookies, extraction.domains);
    let metadata: Readonly<Record<string, string>> = Object.freeze({});
    if (extraction.metadataExpression !== undefined && pageConnection !== undefined) {
      const evaluation = await pageConnection.request("Runtime.evaluate", { expression: extraction.metadataExpression, returnByValue: true }) as { result: { value?: Record<string, string> } };
      if (evaluation.result.value !== undefined) metadata = Object.freeze(evaluation.result.value);
    }
    return Object.freeze({ cookies, metadata });
  };
  captureCookies = currentResult;
  await captureInterrupt();
  const interruptedResult = async (): Promise<ChromeCookieResult | undefined> => {
    if (interruptResult === undefined) return undefined;
    await closeChrome(chrome, connection, pageConnection);
    process.off("SIGINT", interrupt);
    if (interruptResult === null) throw new Error("Login not saved");
    return interruptResult;
  };
  for (;;) {
    if (extraction.service === "chatgpt") {
      const challengeUrl = await chatgptChallengeUrl(pageConnection!);
      const manualResult = await interruptedResult();
      if (manualResult !== undefined) return manualResult;
      if (challengeUrl !== null) {
        await closeChrome(chrome, connection, pageConnection);
        process.off("SIGINT", interrupt);
        throw new Error(`ChatGPT login is stuck on an HTML challenge: ${challengeUrl}`);
      }
    }
    const result = await currentResult();
    const manualResult = await interruptedResult();
    if (manualResult !== undefined) return manualResult;
    if (extraction.ready(result.cookies)) {
      let metadata: Readonly<Record<string, string>> = result.metadata;
      if (extraction.service === "chatgpt") {
        const chatgptMetadata = await Promise.race([chatgptBrowserMetadata(pageConnection!), interruptPromise.then(() => undefined)]);
        const interruptedChatgptResult = await interruptedResult();
        if (interruptedChatgptResult !== undefined) return interruptedChatgptResult;
        if (chatgptMetadata === undefined) continue;
        if (chatgptMetadata === null) {
          await closeChrome(chrome, connection, pageConnection);
          process.off("SIGINT", interrupt);
          throw new Error("ChatGPT login is blocked by an HTML challenge. Complete `wire chatgpt login` in the opened Chrome window, then retry.");
        }
        metadata = chatgptMetadata;
      } else if (extraction.metadataExpression !== undefined) {
        if (Object.keys(metadata).length === 0) {
          await Promise.race([sleep(1000), interruptPromise]);
          const interruptedMetadataResult = await interruptedResult();
          if (interruptedMetadataResult !== undefined) return interruptedMetadataResult;
          continue;
        }
      }
      if (extraction.service !== "chatgpt" && !(await Promise.race([extraction.verify(result.cookies, metadata), interruptPromise.then(() => false)]))) {
        const interruptedVerifyResult = await interruptedResult();
        if (interruptedVerifyResult !== undefined) return interruptedVerifyResult;
        await Promise.race([sleep(1000), interruptPromise]);
        const interruptedSleepResult = await interruptedResult();
        if (interruptedSleepResult !== undefined) return interruptedSleepResult;
        continue;
      }
      await closeChrome(chrome, connection, pageConnection);
      process.off("SIGINT", interrupt);
      return Object.freeze({ cookies: result.cookies, metadata });
    }
    await Promise.race([sleep(1000), interruptPromise]);
    const interruptedSleepResult = await interruptedResult();
    if (interruptedSleepResult !== undefined) return interruptedSleepResult;
  }
}
