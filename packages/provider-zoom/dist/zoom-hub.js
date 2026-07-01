import { defineService } from "wire-core";
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
function zoomAuthError() {
    return new Error("Zoom authentication is missing or expired. Run `wire zoom login` once; other commands reuse saved cookies.");
}
function hubHeaders(jwt, contentType) {
    return { "user-agent": userAgent, authorization: `Bearer ${jwt}`, "x-zm-cluster-id": "aw1", "x-zm-docs-container": "drive/browser", "x-zm-docs-loading": "init", "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/", ...(contentType === undefined ? {} : { "content-type": contentType }) };
}
function formatMeetingStartTime(value, timezone) {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
function meetingDate(value, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values["year"]}-${values["month"]}-${values["day"]}`;
}
function transcriptTitle(title, startTime, timezone) {
    const base = title.replace(/\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b/g, " ").replace(/\b[0-9]{1,2}:?[0-9]{2}\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    return `${meetingDate(startTime, timezone)}-${base}`;
}
async function zoomText(response, label) {
    const text = await response.text();
    if (response.status === 401)
        throw zoomAuthError();
    if (!response.ok)
        throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${text}`);
    return text;
}
async function zoomJson(response, label) {
    const body = await response.json();
    if (response.status === 401)
        throw zoomAuthError();
    if (!response.ok)
        throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
    return body;
}
function zoomJwt(text) {
    const token = text.trim();
    if (token.split(".").length !== 3)
        throw zoomAuthError();
    return token;
}
function cookieKey(cookie) {
    return `${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}\t${cookie.path}\t${cookie.name}`;
}
function cookieJar(cookies) {
    return new Map(cookies.map((cookie) => [cookieKey(cookie), cookie]));
}
function domainMatches(cookie, hostname) {
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    return hostname === domain || (cookie.includeSubdomains && hostname.endsWith(`.${domain}`));
}
function pathMatches(cookiePath, requestPath) {
    return requestPath === cookiePath || requestPath.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}
function requestCookies(jar, url, now) {
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return [...jar.values()].filter((cookie) => {
        if (cookie.expires !== 0 && cookie.expires <= nowSeconds)
            return false;
        if (cookie.secure && url.protocol !== "https:")
            return false;
        if (!domainMatches(cookie, url.hostname))
            return false;
        return pathMatches(cookie.path, url.pathname);
    }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function defaultCookiePath(pathname) {
    const index = pathname.lastIndexOf("/");
    return index <= 0 ? "/" : pathname.slice(0, index);
}
function splitSetCookieHeader(value) {
    return Object.freeze(value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()));
}
function setCookieHeaders(response) {
    const headers = response.headers;
    const values = headers.getSetCookie?.();
    if (values !== undefined)
        return Object.freeze(values);
    const value = response.headers.get("set-cookie");
    if (value === null)
        return Object.freeze([]);
    return splitSetCookieHeader(value);
}
function cookieAttributes(parts) {
    return new Map(parts.map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
    }));
}
function setCookieExpires(attributes, now) {
    if (attributes.has("max-age"))
        return Math.floor(now.getTime() / 1000) + Number(attributes.get("max-age"));
    if (attributes.has("expires"))
        return Math.floor(Date.parse(attributes.get("expires")) / 1000);
    return 0;
}
function applySetCookie(jar, url, header, now) {
    const parts = header.split(";").map((part) => part.trim());
    const pair = parts[0];
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const attributes = cookieAttributes(parts.slice(1));
    const domain = attributes.has("domain") ? attributes.get("domain") : url.hostname;
    const path = attributes.has("path") ? attributes.get("path") : defaultCookiePath(url.pathname);
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
    if (expires !== 0 && expires <= Math.floor(now.getTime() / 1000))
        return jar.delete(key);
    const existing = jar.get(key);
    jar.set(key, cookie);
    return existing === undefined || existing.value !== cookie.value || existing.expires !== cookie.expires || existing.secure !== cookie.secure || existing.httpOnly !== cookie.httpOnly || existing.includeSubdomains !== cookie.includeSubdomains;
}
function applyResponseCookies(jar, url, response, now) {
    let changed = false;
    for (const header of setCookieHeaders(response))
        changed = applySetCookie(jar, url, header, now) || changed;
    return changed;
}
function pruneExpiredCookies(jar, now) {
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
export const zoomHubService = defineService({
    name: "zoom-hub",
    matches: (url) => url.hostname === "hub.zoom.us" && /^\/doc\/[^/]+\/?$/.test(url.pathname),
    parse: (url) => Object.freeze({ service: "zoom-hub", identifier: /^\/doc\/([^/]+)\/?$/.exec(url.pathname)[1], type: "transcript" }),
    fetch: async (runtime, _url, source) => {
        const cookies = await runtime.cookies.loadSaved("zoom");
        if (cookies === null)
            throw zoomAuthError();
        const jar = cookieJar(cookies);
        const state = { metadata: await runtime.cookies.metadata("zoom") };
        const save = () => runtime.cookies.save("zoom", Object.freeze([...jar.values()]), state.metadata);
        if (pruneExpiredCookies(jar, runtime.clock.now()))
            await save();
        const accountCookie = [...jar.values()].find((value) => value.name === "zm_aid");
        if (accountCookie === undefined)
            throw zoomAuthError();
        const accountId = accountCookie.value;
        const zoomRequest = async (url, init) => {
            const parsed = new URL(url);
            const response = await runtime.http.request(url, { ...init, headers: { ...init.headers, cookie: requestCookies(jar, parsed, runtime.clock.now()) } });
            if (applyResponseCookies(jar, parsed, response, runtime.clock.now()))
                await save();
            return response;
        };
        const refreshJwt = async () => {
            const jwtResponse = await zoomRequest("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": userAgent, "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/" } });
            const jwt = zoomJwt(await zoomText(jwtResponse, "JWT"));
            state.metadata = Object.freeze({ ...state.metadata, hub_jwt: jwt, hub_jwt_expires: String(runtime.clock.now().getTime() + 1_800_000) });
            await save();
            return jwt;
        };
        const cachedJwt = state.metadata["hub_jwt"];
        const cachedExpires = state.metadata["hub_jwt_expires"];
        let cached = cachedJwt !== undefined && cachedExpires !== undefined && runtime.clock.now().getTime() < Number(cachedExpires);
        let jwt = cached ? cachedJwt : await refreshJwt();
        const docsRequest = async (url, init) => {
            const response = await zoomRequest(url, init(jwt));
            if (response.status !== 401 || !cached)
                return response;
            cached = false;
            jwt = await refreshJwt();
            return zoomRequest(url, init(jwt));
        };
        const fileResponse = await docsRequest("https://us01docs.zoom.us/api/file/files/action/batch_get", (token) => ({ method: "POST", headers: hubHeaders(token, "application/json"), body: JSON.stringify({ ids: [source.identifier], accountId }) }));
        const files = (await zoomJson(fileResponse, "file batch_get"))["successItems"];
        if (files.length === 0)
            throw new Error(`Zoom Hub file ${source.identifier} was not returned by batch_get`);
        const document = files[0];
        const notes = document["meetingNotes"];
        const meetingId = notes["meetingId"];
        const mainMeetingId = notes["mainMeetingId"];
        const base = { recording_id: source.identifier, title: document["title"], source_url: document["fileLink"], meeting_id: meetingId, main_meeting_id: mainMeetingId, owner: document["owner"]["ownerName"], created_at: document["createdInfo"]["time"], updated_at: document["updatedInfo"]["time"] };
        if (meetingId !== "") {
            const statusResponse = await docsRequest(`https://us01docs.zoom.us/api/meeting/transcript_status?meetingId=${encodeURIComponent(meetingId)}`, (token) => ({ headers: hubHeaders(token) }));
            const status = (await zoomJson(statusResponse, "transcript status"))["aicTranscript"];
            if (!status["exist"] || !status["canAccess"]) {
                const result = { ...base, transcript: "", state: status["exist"] ? "denied" : "missing" };
                const markdown = [`# ${result.title}`, "", `- Transcript state: ${result.state}`, `- Recording ID: ${result.recording_id}`, `- Meeting ID: ${result.meeting_id}`, `- Main meeting ID: ${result.main_meeting_id}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`].join("\n");
                return Object.freeze({ title: result.title, markdown, data: result });
            }
        }
        const transcriptResponse = await docsRequest(`https://us01docs.zoom.us/api/bridge/meeting/transcripts/v2?meetingId=${encodeURIComponent(meetingId)}&fileId=${encodeURIComponent(source.identifier)}`, (token) => ({ headers: hubHeaders(token) }));
        const raw = await zoomJson(transcriptResponse, "transcript");
        const speakers = raw["speakers"];
        const speakerMap = new Map(speakers.map((speaker) => [speaker["userId"], speaker["username"]]));
        const transcript = raw["items"].map((item) => {
            const userId = item["userId"];
            return `- [${item["startTime"]}] **${speakerMap.get(userId) ?? userId}:** ${item["text"]}`;
        }).join("\n");
        const result = { ...base, meeting_start_time: new Date(Number(raw["meetingStartTime"])).toISOString().replace("Z", "+00:00"), participants: speakers.map((speaker) => speaker["username"]), transcript, raw, state: "ready" };
        const lines = [`# ${result.title}`, "", `- Meeting start: ${formatMeetingStartTime(result.meeting_start_time, runtime.clock.localTimezone())}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`, "", "## Transcript", "", result.transcript];
        return Object.freeze({ title: transcriptTitle(result.title, result.meeting_start_time, runtime.clock.localTimezone()), markdown: lines.join("\n"), data: result });
    },
});
//# sourceMappingURL=zoom-hub.js.map