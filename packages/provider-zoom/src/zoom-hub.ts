import { createHash } from "node:crypto";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { defineService } from "wire-core";
import type { Cookie } from "wire-core";
import type { JsonObject } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
type CookieJar = Map<string, Cookie>;
type ZoomHeaders = Record<string, string>;

function zoomAuthError(): Error {
  return new Error("Zoom authentication is missing or expired. Run `wire zoom login` once; other commands reuse saved cookies.");
}

function hubHeaders(jwt: string, contentType?: string): ZoomHeaders {
  return { "user-agent": userAgent, authorization: `Bearer ${jwt}`, "x-zm-cluster-id": "aw1", "x-zm-docs-container": "drive/browser", "x-zm-docs-loading": "init", "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/", ...(contentType === undefined ? {} : { "content-type": contentType }) };
}

function formatMeetingStartTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

function meetingDate(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function transcriptTitle(title: string, startTime: string, timezone: string): string {
  const base = title.replace(/\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b/g, " ").replace(/\b[0-9]{1,2}:?[0-9]{2}\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return `${meetingDate(startTime, timezone)}-${base}`;
}

async function zoomText(response: Response, label: string): Promise<string> {
  const text = await response.text();
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${text}`);
  return text;
}

class UnavailableDocument extends Error {}

async function zoomJson(response: Response, label: string): Promise<JsonObject> {
  if (response.status === 401) throw zoomAuthError();
  if (response.status === 403 || response.status === 404) throw new UnavailableDocument(`Zoom Hub ${label} failed: HTTP ${response.status} ${await response.text()}`);
  const body = await response.json() as JsonObject;
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function zoomJwt(text: string): string {
  const token = text.trim();
  if (token.split(".").length !== 3) throw zoomAuthError();
  return token;
}

function cookieKey(cookie: Cookie): string {
  return `${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}\t${cookie.path}\t${cookie.name}`;
}

function cookieJar(cookies: readonly Cookie[]): CookieJar {
  return new Map(cookies.map((cookie) => [cookieKey(cookie), cookie]));
}

function domainMatches(cookie: Cookie, hostname: string): boolean {
  const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
  return hostname === domain || (cookie.includeSubdomains && hostname.endsWith(`.${domain}`));
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  return requestPath === cookiePath || requestPath.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}

function requestCookies(jar: CookieJar, url: URL, now: Date): string {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return [...jar.values()].filter((cookie) => {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) return false;
    if (cookie.secure && url.protocol !== "https:") return false;
    if (!domainMatches(cookie, url.hostname)) return false;
    return pathMatches(cookie.path, url.pathname);
  }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function defaultCookiePath(pathname: string): string {
  const index = pathname.lastIndexOf("/");
  return index <= 0 ? "/" : pathname.slice(0, index);
}

function splitSetCookieHeader(value: string): readonly string[] {
  return Object.freeze(value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()));
}

function setCookieHeaders(response: Response): readonly string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.();
  if (values !== undefined) return Object.freeze(values);
  const value = response.headers.get("set-cookie");
  if (value === null) return Object.freeze([]);
  return splitSetCookieHeader(value);
}

function cookieAttributes(parts: readonly string[]): Map<string, string> {
  return new Map(parts.map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
  }));
}

function setCookieExpires(attributes: Map<string, string>, now: Date): number {
  if (attributes.has("max-age")) return Math.floor(now.getTime() / 1000) + Number(attributes.get("max-age")!);
  if (attributes.has("expires")) return Math.floor(Date.parse(attributes.get("expires")!) / 1000);
  return 0;
}

function applySetCookie(jar: CookieJar, url: URL, header: string, now: Date): boolean {
  const parts = header.split(";").map((part) => part.trim());
  const pair = parts[0]!;
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator);
  const value = pair.slice(separator + 1);
  const attributes = cookieAttributes(parts.slice(1));
  const domain = attributes.has("domain") ? attributes.get("domain")! : url.hostname;
  const path = attributes.has("path") ? attributes.get("path")! : defaultCookiePath(url.pathname);
  const expires = setCookieExpires(attributes, now);
  const cookie = Object.freeze({
    domain,
    includeSubdomains: attributes.has("domain") || domain.startsWith("."),
    path,
    secure: attributes.has("secure"),
    expires,
    name,
    value,
    httpOnly: attributes.has("httponly"),
  });
  const key = cookieKey(cookie);
  if (expires !== 0 && expires <= Math.floor(now.getTime() / 1000)) return jar.delete(key);
  const existing = jar.get(key);
  jar.set(key, cookie);
  return existing === undefined || existing.value !== cookie.value || existing.expires !== cookie.expires || existing.secure !== cookie.secure || existing.httpOnly !== cookie.httpOnly || existing.includeSubdomains !== cookie.includeSubdomains;
}

function applyResponseCookies(jar: CookieJar, url: URL, response: Response, now: Date): boolean {
  let changed = false;
  for (const header of setCookieHeaders(response)) changed = applySetCookie(jar, url, header, now) || changed;
  return changed;
}

function pruneExpiredCookies(jar: CookieJar, now: Date): boolean {
  let changed = false;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  for (const [key, cookie] of jar.entries()) {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) {
      jar.delete(key);
      changed = true;
    }
  }
  return changed;
}

async function connectZoom(runtime: RuntimeCapabilities, pace: boolean) {
  const cookies = await runtime.cookies.loadSaved("zoom");
  if (cookies === null) throw zoomAuthError();
  const jar = cookieJar(cookies);
  const state = { metadata: await runtime.cookies.metadata("zoom") };
  const save = () => runtime.cookies.save("zoom", Object.freeze([...jar.values()]), state.metadata);
  if (pruneExpiredCookies(jar, runtime.clock.now())) await save();
  const accountCookie = [...jar.values()].find((value) => value.name === "zm_aid");
  if (accountCookie === undefined) throw zoomAuthError();
  const accountId = accountCookie.value;
  let nextRequest = 0;
  const zoomRequest = async (url: string, init: RequestInit & { headers: ZoomHeaders }): Promise<Response> => {
    const parsed = new URL(url);
    for (let attempt = 0; ; attempt++) {
      if (pace) {
        const wait = Math.max(nextRequest, Number(state.metadata["hub_retry_at"] ?? 0)) - runtime.clock.now().getTime();
        if (wait > 60_000) throw new Error(`Zoom Hub rate limited; retry after ${new Date(Number(state.metadata["hub_retry_at"])).toISOString()}`);
        if (wait > 0) await sleep(wait);
      }
      const response = await runtime.http.request(url, { ...init, headers: { ...init.headers, cookie: requestCookies(jar, parsed, runtime.clock.now()) } });
      const now = runtime.clock.now();
      nextRequest = now.getTime() + 1000;
      if (applyResponseCookies(jar, parsed, response, now)) await save();
      if (!pace || response.status !== 429) return response;
      await response.body?.cancel();
      const retry = response.headers.get("retry-after");
      const serverDate = Date.parse(response.headers.get("date") ?? "");
      const wait = retry !== null && /^\d+$/.test(retry) ? Number(retry) * 1000
        : retry !== null && Number.isFinite(Date.parse(retry)) ? Date.parse(retry) - (Number.isFinite(serverDate) ? serverDate : now.getTime())
        : 1000 * 2 ** attempt;
      const deadline = now.getTime() + Math.max(1000, wait);
      state.metadata = { ...state.metadata, hub_retry_at: String(deadline) };
      await save();
      if (attempt === 4 || wait > 60_000) throw new Error(`Zoom Hub rate limited; retry after ${new Date(deadline).toISOString()}`);
    }
  };
  const refreshJwt = async (): Promise<string> => {
    const jwtResponse = await zoomRequest("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": userAgent, "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/" } });
    const jwt = zoomJwt(await zoomText(jwtResponse, "JWT"));
    state.metadata = Object.freeze({ ...state.metadata, hub_jwt: jwt, hub_jwt_expires: String(runtime.clock.now().getTime() + 1_800_000) });
    await save();
    return jwt;
  };
  const cachedJwt = state.metadata["hub_jwt"];
  const cachedExpires = state.metadata["hub_jwt_expires"];
  let cached = cachedJwt !== undefined && cachedExpires !== undefined && runtime.clock.now().getTime() < Number(cachedExpires);
  let jwt = cached ? cachedJwt! : await refreshJwt();
  const docsRequest = async (url: string, init: (token: string) => RequestInit & { headers: ZoomHeaders }): Promise<Response> => {
    const response = await zoomRequest(url, init(jwt));
    if (response.status !== 401 || (!cached && !pace)) return response;
    await response.body?.cancel();
    cached = false;
    jwt = await refreshJwt();
    return zoomRequest(url, init(jwt));
  };
  return { accountId, docsRequest };
}

type ZoomClient = Awaited<ReturnType<typeof connectZoom>>;

async function transcript(runtime: RuntimeCapabilities, { docsRequest }: ZoomClient, identifier: string, document: JsonObject) {
  const notes = document["meetingNotes"] as JsonObject;
  const meetingId = notes["meetingId"] as string;
  const mainMeetingId = notes["mainMeetingId"] as string;
  const base = { recording_id: identifier, title: document["title"] as string, source_url: document["fileLink"] as string, meeting_id: meetingId, main_meeting_id: mainMeetingId, owner: (document["owner"] as JsonObject)["ownerName"] as string, created_at: (document["createdInfo"] as JsonObject)["time"] as string, updated_at: (document["updatedInfo"] as JsonObject)["time"] as string };
  if (meetingId !== "") {
    const statusResponse = await docsRequest(`https://us01docs.zoom.us/api/meeting/transcript_status?meetingId=${encodeURIComponent(meetingId)}`, (token) => ({ headers: hubHeaders(token) }));
    const status = (await zoomJson(statusResponse, "transcript status"))["aicTranscript"] as JsonObject;
    if (!(status["exist"] as boolean) || !(status["canAccess"] as boolean)) {
      const result = { ...base, transcript: "", state: status["exist"] as boolean ? "denied" : "missing" };
      const markdown = [`# ${result.title}`, "", `- Transcript state: ${result.state}`, `- Recording ID: ${result.recording_id}`, `- Meeting ID: ${result.meeting_id}`, `- Main meeting ID: ${result.main_meeting_id}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`].join("\n");
      return { document: Object.freeze({ title: result.title, markdown, data: result }), archive: null };
    }
  }
  const transcriptResponse = await docsRequest(`https://us01docs.zoom.us/api/bridge/meeting/transcripts/v2?meetingId=${encodeURIComponent(meetingId)}&fileId=${encodeURIComponent(identifier)}`, (token) => ({ headers: hubHeaders(token) }));
  const raw = await zoomJson(transcriptResponse, "transcript");
  const speakers = raw["speakers"] as readonly JsonObject[];
  const speakerMap = new Map(speakers.map((speaker) => [speaker["userId"] as string, speaker["username"] as string]));
  const segments = (raw["items"] as readonly JsonObject[]).map(item => {
    const speaker_id = item["userId"] as string;
    return { start: item["startTime"] as string, end: item["endTime"] as string, speaker_id, speaker: speakerMap.get(speaker_id) ?? speaker_id, text: item["text"] as string };
  });
  const turns: string[] = [];
  let previous: string | undefined;
  let length = 0;
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    if (segment.speaker_id === previous && length + text.length < 600) {
      turns[turns.length - 1] += " " + text;
      length += 1 + text.length;
    } else {
      turns.push(`- [${segment.start.replace(/\.000$/, "")}] **${segment.speaker}:** ${text}`);
      previous = segment.speaker_id;
      length = text.length;
    }
  }
  const transcript = turns.join("\n\n");
  const result = { ...base, meeting_start_time: new Date(Number(raw["meetingStartTime"])).toISOString().replace("Z", "+00:00"), participants: speakers.map((speaker) => speaker["username"] as string), transcript, raw, state: "ready" };
  const lines = [`# ${result.title}`, "", `- Meeting start: ${formatMeetingStartTime(result.meeting_start_time, runtime.clock.localTimezone())}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`, "", "## Transcript", "", result.transcript];
  return { document: Object.freeze({ title: transcriptTitle(result.title, result.meeting_start_time, runtime.clock.localTimezone()), markdown: lines.join("\n"), data: result }), archive: { ...base, meeting_start_time: result.meeting_start_time, participants: result.participants, segments } };
}

export const zoomHubService = defineService<RuntimeCapabilities>({
  name: "zoom-hub",
  matches: (url) => url.hostname === "hub.zoom.us" && /^\/doc\/[^/]+\/?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "zoom-hub", identifier: /^\/doc\/([^/]+)\/?$/.exec(url.pathname)![1]!, type: "transcript" }),
  fetch: async (runtime, _url, source) => {
    const client = await connectZoom(runtime, false);
    const { accountId, docsRequest } = client;
    const fileResponse = await docsRequest("https://us01docs.zoom.us/api/file/files/action/batch_get", (token) => ({ method: "POST", headers: hubHeaders(token, "application/json"), body: JSON.stringify({ ids: [source.identifier], accountId }) }));
    const files = (await zoomJson(fileResponse, "file batch_get"))["successItems"] as readonly JsonObject[];
    if (files.length === 0) throw new Error(`Zoom Hub file ${source.identifier} was not returned by batch_get`);
    const document = files[0]!;
    return (await transcript(runtime, client, source.identifier, document)).document;
  },
});

export async function scrapeZoom(runtime: RuntimeCapabilities, directory: string) {
  const client = await connectZoom(runtime, true);
  const request = async (path: string, body?: JsonObject) => zoomJson(await client.docsRequest(
    "https://us01docs.zoom.us/api/" + path, token => body === undefined ? { headers: hubHeaders(token) }
      : { method: "POST", headers: hubHeaders(token, "application/json"), body: JSON.stringify(body) }), path);
  const seen = new Set<string>();
  const counts = { downloaded: 0, unchanged: 0, unavailable: 0, locallyModified: 0 };
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  const sync = async (file: JsonObject) => {
    const id = file["id"] as string;
    const notes = file["meetingNotes"] as JsonObject | null;
    if (file["isDeleted"] || !notes || !(notes["meetingId"] || notes["mainMeetingId"] || notes["source"] === "1pMeeting") || seen.has(id)) return;
    seen.add(id);
    const path = join(directory, "zoom", encodeURIComponent(id) + ".md");
    const version = (file["updatedInfo"] as JsonObject)["time"];
    const jsonPath = join(directory, "zoom", encodeURIComponent(id) + ".json");
    const hasJson = await runtime.filesystem.exists(jsonPath);
    if (await runtime.filesystem.exists(path)) {
      const contents = await runtime.filesystem.readText(path);
      const marker = /\n\n<!-- wire:zoom (\S+) ([a-f0-9]{64})(?: ([a-f0-9]{64}))? -->\n$/.exec(contents);
      if (!marker || digest(contents.slice(0, marker.index)) !== marker[2]) { counts.locallyModified++; return; }
      if (hasJson && digest(await runtime.filesystem.readText(jsonPath)) !== marker[3]) { counts.locallyModified++; return; }
      if (hasJson && version === marker[1]) { counts.unchanged++; return; }
    } else if (hasJson) { counts.locallyModified++; return; }
    let doc;
    try { doc = await transcript(runtime, client, id, file); }
    catch (error) {
      if (!(error instanceof UnavailableDocument)) throw error;
      counts.unavailable++; return;
    }
    if (!doc.archive || !doc.document.data.transcript) { counts.unavailable++; return; }
    const json = JSON.stringify(doc.archive, null, 2) + "\n";
    await runtime.filesystem.writeText(path, doc.document.markdown + `\n\n<!-- wire:zoom ${version} ${digest(doc.document.markdown)} ${digest(json)} -->\n`);
    await runtime.filesystem.writeText(jsonPath, json);
    counts.downloaded++;
  };
  let token = "";
  const tokens = new Set<string>();
  do {
    const page = await request("file/recent?limit=50" + (token ? "&pagingToken=" + encodeURIComponent(token) : ""));
    for (const entry of page["recentFiles"] as readonly JsonObject[]) await sync(entry["file"] as JsonObject);
    token = page["nextPagingToken"] as string;
    if (token && tokens.has(token)) throw new Error("Zoom Hub repeated a recent files page token");
    tokens.add(token);
  } while (token);

  const first = Date.UTC(2011, 0, 1);
  for (let end = runtime.clock.now().getTime(); end >= first;) {
    const start = Math.max(first, end - 30 * 86400_000 + 1);
    for (let pageNum = 0; ; pageNum++) {
      const page = await request("meeting/list_my_meetings", { startTime: start, endTime: end, pageNum, pageSize: 50, meetingFilter: 0, filters: {}, query: "" });
      const ids = [...new Set((page["meetings"] as readonly JsonObject[]).map(m => m["meetingId"] as string))];
      for (let i = 0; i < ids.length; i += 5) {
        const assets = await request("hub/files/batch_get_meeting_assets", { meetingIds: ids.slice(i, i + 5), meetingAccountId: client.accountId });
        for (const entry of Object.values(assets["meetingAssetsMap"] as Record<string, JsonObject>)) {
          for (const item of entry["createFromMeeting"] as readonly JsonObject[]) {
            if (item["doc"]) await sync(item["doc"] as JsonObject);
          }
        }
      }
      if (!page["hasNext"]) break;
    }
    end = start - 1;
  }
  return counts;
}
