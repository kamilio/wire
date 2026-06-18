import { defineService } from "wire-core";
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
function zoomAuthError() {
    return new Error("Zoom authentication is missing or expired. Run `wire zoom login` once; other commands reuse saved cookies.");
}
function hubHeaders(cookie, jwt, contentType) {
    return { cookie, "user-agent": userAgent, authorization: `Bearer ${jwt}`, "x-zm-cluster-id": "aw1", "x-zm-docs-container": "drive/browser", "x-zm-docs-loading": "init", "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/", ...(contentType === undefined ? {} : { "content-type": contentType }) };
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
    const base = title.replace(/\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b/g, " ").replace(/\b[0-9]{1,2}:[0-9]{2}\s*\([^)]*\)/g, " ").replace(/\b[0-9]{3,4}\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
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
function zoomCsrf(text) {
    const index = text.indexOf(":");
    if (index === -1)
        throw zoomAuthError();
    const token = text.slice(index + 1).trim();
    if (token === "")
        throw zoomAuthError();
    return token;
}
function zoomJwt(text) {
    const token = text.trim();
    if (token.split(".").length !== 3)
        throw zoomAuthError();
    return token;
}
export const zoomHubService = defineService({
    name: "zoom-hub",
    matches: (url) => url.hostname === "hub.zoom.us" && /^\/doc\/[^/]+\/?$/.test(url.pathname),
    parse: (url) => Object.freeze({ service: "zoom-hub", identifier: /^\/doc\/([^/]+)\/?$/.exec(url.pathname)[1], type: "transcript" }),
    fetch: async (runtime, _url, source) => {
        const cookies = await runtime.cookies.loadSaved("zoom");
        if (cookies === null)
            throw zoomAuthError();
        const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
        const accountCookie = cookies.find((value) => value.name === "zm_aid");
        if (accountCookie === undefined)
            throw zoomAuthError();
        const accountId = accountCookie.value;
        const csrfResponse = await runtime.http.request("https://zoom.us/csrf_js", { method: "POST", headers: { cookie, "user-agent": userAgent, "fetch-csrf-token": "1", referer: "https://hub.zoom.us/" }, body: "" });
        const csrf = zoomCsrf(await zoomText(csrfResponse, "CSRF"));
        const jwtResponse = await runtime.http.request("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { cookie, "user-agent": userAgent, "zoom-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/" } });
        const jwt = zoomJwt(await zoomText(jwtResponse, "JWT"));
        const fileResponse = await runtime.http.request("https://us01docs.zoom.us/api/file/files/action/batch_get", { method: "POST", headers: hubHeaders(cookie, jwt, "application/json"), body: JSON.stringify({ ids: [source.identifier], accountId }) });
        const files = (await zoomJson(fileResponse, "file batch_get"))["successItems"];
        if (files.length === 0)
            throw new Error(`Zoom Hub file ${source.identifier} was not returned by batch_get`);
        const document = files[0];
        const notes = document["meetingNotes"];
        const meetingId = notes["meetingId"];
        const statusResponse = await runtime.http.request(`https://us01docs.zoom.us/api/meeting/transcript_status?meetingId=${encodeURIComponent(meetingId)}`, { headers: hubHeaders(cookie, jwt) });
        const status = (await zoomJson(statusResponse, "transcript status"))["aicTranscript"];
        const base = { recording_id: source.identifier, title: document["title"], source_url: document["fileLink"], meeting_id: meetingId, main_meeting_id: notes["mainMeetingId"], owner: document["owner"]["ownerName"], created_at: document["createdInfo"]["time"], updated_at: document["updatedInfo"]["time"] };
        if (!status["exist"] || !status["canAccess"]) {
            const result = { ...base, transcript: "", state: status["exist"] ? "denied" : "missing" };
            const markdown = [`# ${result.title}`, "", `- Transcript state: ${result.state}`, `- Recording ID: ${result.recording_id}`, `- Meeting ID: ${result.meeting_id}`, `- Main meeting ID: ${result.main_meeting_id}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`].join("\n");
            return Object.freeze({ title: result.title, markdown, data: result });
        }
        const transcriptResponse = await runtime.http.request(`https://us01docs.zoom.us/api/bridge/meeting/transcripts/v2?meetingId=${encodeURIComponent(meetingId)}&fileId=${encodeURIComponent(source.identifier)}`, { headers: hubHeaders(cookie, jwt) });
        const raw = await zoomJson(transcriptResponse, "transcript");
        const speakers = raw["speakers"];
        const speakerMap = new Map(speakers.map((speaker) => [speaker["userId"], speaker["username"]]));
        const transcript = raw["items"].map((item) => {
            const userId = item["userId"];
            return `[${item["startTime"]}] ${speakerMap.get(userId) ?? userId} — ${item["text"]}`;
        }).join("\n");
        const result = { ...base, meeting_start_time: new Date(Number(raw["meetingStartTime"])).toISOString().replace("Z", "+00:00"), participants: speakers.map((speaker) => speaker["username"]), transcript, raw, state: "ready" };
        const lines = [`# ${result.title}`, "", `- Meeting start: ${formatMeetingStartTime(result.meeting_start_time, runtime.clock.localTimezone())}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`, "", "## Transcript", "", result.transcript];
        return Object.freeze({ title: transcriptTitle(result.title, result.meeting_start_time, runtime.clock.localTimezone()), markdown: lines.join("\n"), data: result });
    },
});
//# sourceMappingURL=zoom-hub.js.map