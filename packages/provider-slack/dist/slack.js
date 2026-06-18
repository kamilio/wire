import { defineService } from "wire-core";
function slackAuthError() {
    return new Error("slack cookie authentication is missing or expired. Run `wire slack login` once; other commands reuse saved cookies.");
}
function decodeEntities(text) {
    return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function markdownLinkLabel(value) {
    return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function cleanText(text) {
    return decodeEntities(text.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_match, id, label) => `@${label ?? id}`).replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<#([A-Z0-9]+)>/g, "#$1").replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1").replace(/<!(here|channel|everyone)>/g, "@$1").replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownLinkLabel(label)}](${url})`).replace(/<(https?:\/\/[^>]+)>/g, "$1").replace(/<(mailto:[^|>]+)\|([^>]+)>/g, "$2"));
}
async function api(runtime, origin, token, cookie, method, parameters) {
    const body = new URLSearchParams({ token, ...parameters });
    const response = await runtime.http.request(`${origin}/api/${method}`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" }, body });
    const json = await response.json();
    if (!response.ok)
        throw new Error(`Slack API ${method} failed: HTTP ${response.status} ${JSON.stringify(json)}`);
    if (json["ok"] === false)
        throw new Error(`Slack API ${method} failed: ${json["error"]}`);
    return json;
}
function formatTimestamp(timestamp, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Number(timestamp) * 1000));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values["year"]}-${values["month"]}-${values["day"]} ${values["hour"]}:${values["minute"]}`;
}
function messageParts(url) {
    const archive = /^\/archives\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
    if (url.hostname.endsWith(".slack.com") && archive !== null)
        return Object.freeze({ channel: archive[1], rawTimestamp: archive[2] });
    const app = /^\/client\/[^/]+\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
    if (url.hostname === "app.slack.com" && app !== null)
        return Object.freeze({ channel: app[1], rawTimestamp: app[2] });
    const thread = /^\/client\/[^/]+\/([^/]+)\/thread\/[^-]+-([0-9]+\.[0-9]+)\/?$/.exec(url.pathname);
    if (url.hostname === "app.slack.com" && thread !== null)
        return Object.freeze({ channel: thread[1], rawTimestamp: thread[2] });
    return undefined;
}
function slackTimestamp(rawTimestamp) {
    if (rawTimestamp.includes("."))
        return rawTimestamp;
    return `${rawTimestamp.slice(0, -6)}.${rawTimestamp.slice(-6)}`;
}
export const slackService = defineService({
    name: "slack",
    matches: (url) => messageParts(url) !== undefined,
    parse: (url) => {
        const parts = messageParts(url);
        const timestamp = slackTimestamp(parts.rawTimestamp);
        const threadTimestamp = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts") : timestamp;
        return Object.freeze({ service: "slack", identifier: `${parts.channel}:${threadTimestamp}`, type: "message-thread", channel_id: parts.channel, timestamp, thread_timestamp: threadTimestamp });
    },
    fetch: async (runtime, url, source) => {
        const cookies = await runtime.cookies.loadSaved("slack");
        if (cookies === null)
            throw slackAuthError();
        const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
        const metadata = await runtime.cookies.metadata("slack");
        const origin = new URL(url).hostname === "app.slack.com" ? metadata["origin"] : new URL(url).origin;
        const token = metadata["token"];
        const response = await api(runtime, origin, token, cookie, "conversations.replies", { channel: source["channel_id"], ts: source["thread_timestamp"], limit: "999" });
        const userCache = new Map();
        const botCache = new Map();
        const resolveUser = async (id) => {
            if (!userCache.has(id)) {
                const profile = await api(runtime, origin, token, cookie, "users.info", { user: id });
                const user = profile["user"];
                const userProfile = user["profile"];
                const realName = userProfile === undefined ? undefined : userProfile["real_name"];
                const name = user["name"];
                userCache.set(id, realName !== undefined && realName !== "" ? realName : name !== undefined && name !== "" ? name : id);
            }
            return userCache.get(id);
        };
        const messages = [];
        for (const raw of response["messages"]) {
            const userId = raw["user"];
            let userName;
            if (userId !== undefined)
                userName = await resolveUser(userId);
            else if (raw["username"] !== undefined)
                userName = raw["username"];
            else if (raw["bot_profile"] !== undefined)
                userName = raw["bot_profile"]["name"];
            else if (raw["bot_id"] !== undefined) {
                const botId = raw["bot_id"];
                if (!botCache.has(botId))
                    botCache.set(botId, (await api(runtime, origin, token, cookie, "bots.info", { bot: botId }))["bot"]["name"]);
                userName = botCache.get(botId);
            }
            else
                userName = "unknown";
            let text = raw["text"];
            const files = raw["files"] === undefined ? [] : raw["files"].map((file) => Object.freeze({ name: file["name"], url: file["url_private"] }));
            if (text.trim() === "" && files.length > 0)
                text = files.map((file) => `- [${markdownLinkLabel(file.name)}](${file.url})`).join("\n");
            messages.push({ ts: raw["ts"], user_id: userId ?? "unknown", user_name: userName, text, files });
        }
        const mentioned = new Set(messages.flatMap((message) => [...message.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1])));
        for (const id of mentioned)
            await resolveUser(id);
        for (const message of messages)
            message.text = cleanText(message.text.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (_match, id) => `@${userCache.get(id)}`)).replace(/```([^\n])/g, "```\n$1").replace(/([^\n])```/g, "$1\n```");
        const timezone = runtime.clock.localTimezone();
        const date = formatTimestamp(messages[0].ts, timezone).slice(0, 10);
        const titleText = messages[0].text.replace(/https?:\/\/\S+/g, "").slice(0, 30).replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
        const lines = [];
        for (const message of messages)
            lines.push(`## ${message.user_name} — ${formatTimestamp(message.ts, timezone)}`, "", message.text, "");
        return Object.freeze({ title: `${date}-${titleText}`, markdown: `${lines.join("\n").trimEnd()}\n`, data: { channel_id: source["channel_id"], messages } });
    },
});
//# sourceMappingURL=slack.js.map