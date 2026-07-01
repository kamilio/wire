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

async function zoomJson(response: Response, label: string): Promise<JsonObject> {
  const body = await response.json() as JsonObject;
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function zoomCsrf(text: string): string {
  const index = text.indexOf(":");
  if (index === -1) throw zoomAuthError();
  const token = text.slice(index + 1).trim();
  if (token === "") throw zoomAuthError();
  return token;
}

function zoomJwt(text: string): string {
  const token = text.trim();
  if (token.split(".").length !== 3) throw zoomAuthError();
  return token;
}

function cookieKey(cookie: Cookie): string {
  return `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
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

async function saveZoomCookies(runtime: RuntimeCapabilities, jar: CookieJar, metadata: Readonly<Record<string, string>>): Promise<void> {
  await runtime.cookies.save("zoom", Object.freeze([...jar.values()]), metadata);
}

async function zoomRequest(runtime: RuntimeCapabilities, jar: CookieJar, metadata: Readonly<Record<string, string>>, url: string, init: RequestInit & { headers: ZoomHeaders }): Promise<Response> {
  const parsed = new URL(url);
  const response = await runtime.http.request(url, { ...init, headers: { ...init.headers, cookie: requestCookies(jar, parsed, runtime.clock.now()) } });
  if (applyResponseCookies(jar, parsed, response, runtime.clock.now())) await saveZoomCookies(runtime, jar, metadata);
  return response;
}

export const zoomHubService = defineService<RuntimeCapabilities>({
  name: "zoom-hub",
  matches: (url) => url.hostname === "hub.zoom.us" && /^\/doc\/[^/]+\/?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "zoom-hub", identifier: /^\/doc\/([^/]+)\/?$/.exec(url.pathname)![1]!, type: "transcript" }),
  fetch: async (runtime, _url, source) => {
    const cookies = await runtime.cookies.loadSaved("zoom");
    if (cookies === null) throw zoomAuthError();
    const metadata = await runtime.cookies.metadata("zoom");
    const jar = cookieJar(cookies);
    if (pruneExpiredCookies(jar, runtime.clock.now())) await saveZoomCookies(runtime, jar, metadata);
    const accountCookie = [...jar.values()].find((value) => value.name === "zm_aid");
    if (accountCookie === undefined) throw zoomAuthError();
    const accountId = accountCookie.value;
    const csrfResponse = await zoomRequest(runtime, jar, metadata, "https://zoom.us/csrf_js", { method: "POST", headers: { "user-agent": userAgent, "fetch-csrf-token": "1", referer: "https://hub.zoom.us/" }, body: "" });
    const csrf = zoomCsrf(await zoomText(csrfResponse, "CSRF"));
    const jwtResponse = await zoomRequest(runtime, jar, metadata, "https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": userAgent, "zoom-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/" } });
    const jwt = zoomJwt(await zoomText(jwtResponse, "JWT"));
    const fileResponse = await zoomRequest(runtime, jar, metadata, "https://us01docs.zoom.us/api/file/files/action/batch_get", { method: "POST", headers: hubHeaders(jwt, "application/json"), body: JSON.stringify({ ids: [source.identifier], accountId }) });
    const files = (await zoomJson(fileResponse, "file batch_get"))["successItems"] as readonly JsonObject[];
    if (files.length === 0) throw new Error(`Zoom Hub file ${source.identifier} was not returned by batch_get`);
    const document = files[0]!;
    const notes = document["meetingNotes"] as JsonObject;
    const meetingId = notes["meetingId"] as string;
    const base = { recording_id: source.identifier, title: document["title"] as string, source_url: document["fileLink"] as string, meeting_id: meetingId, main_meeting_id: notes["mainMeetingId"] as string, owner: (document["owner"] as JsonObject)["ownerName"] as string, created_at: (document["createdInfo"] as JsonObject)["time"] as string, updated_at: (document["updatedInfo"] as JsonObject)["time"] as string };
    if (meetingId === "") {
      const result = { ...base, transcript: "", state: "missing" };
      const markdown = [`# ${result.title}`, "", `- Transcript state: ${result.state}`, `- Recording ID: ${result.recording_id}`, `- Meeting ID: ${result.meeting_id}`, `- Main meeting ID: ${result.main_meeting_id}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`].join("\n");
      return Object.freeze({ title: transcriptTitle(result.title, result.created_at, runtime.clock.localTimezone()), markdown, data: result });
    }
    const statusResponse = await zoomRequest(runtime, jar, metadata, `https://us01docs.zoom.us/api/meeting/transcript_status?meetingId=${encodeURIComponent(meetingId)}`, { headers: hubHeaders(jwt) });
    const status = (await zoomJson(statusResponse, "transcript status"))["aicTranscript"] as JsonObject;
    if (!(status["exist"] as boolean) || !(status["canAccess"] as boolean)) {
      const result = { ...base, transcript: "", state: status["exist"] as boolean ? "denied" : "missing" };
      const markdown = [`# ${result.title}`, "", `- Transcript state: ${result.state}`, `- Recording ID: ${result.recording_id}`, `- Meeting ID: ${result.meeting_id}`, `- Main meeting ID: ${result.main_meeting_id}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`].join("\n");
      return Object.freeze({ title: result.title, markdown, data: result });
    }
    const transcriptResponse = await zoomRequest(runtime, jar, metadata, `https://us01docs.zoom.us/api/bridge/meeting/transcripts/v2?meetingId=${encodeURIComponent(meetingId)}&fileId=${encodeURIComponent(source.identifier)}`, { headers: hubHeaders(jwt) });
    const raw = await zoomJson(transcriptResponse, "transcript");
    const speakers = raw["speakers"] as readonly JsonObject[];
    const speakerMap = new Map(speakers.map((speaker) => [speaker["userId"] as string, speaker["username"] as string]));
    const transcript = (raw["items"] as readonly JsonObject[]).map((item) => {
      const userId = item["userId"] as string;
      return `- [${item["startTime"] as string}] **${speakerMap.get(userId) ?? userId}:** ${item["text"] as string}`;
    }).join("\n");
    const result = { ...base, meeting_start_time: new Date(Number(raw["meetingStartTime"])).toISOString().replace("Z", "+00:00"), participants: speakers.map((speaker) => speaker["username"] as string), transcript, raw, state: "ready" };
    const lines = [`# ${result.title}`, "", `- Meeting start: ${formatMeetingStartTime(result.meeting_start_time, runtime.clock.localTimezone())}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`, "", "## Transcript", "", result.transcript];
    return Object.freeze({ title: transcriptTitle(result.title, result.meeting_start_time, runtime.clock.localTimezone()), markdown: lines.join("\n"), data: result });
  },
});
