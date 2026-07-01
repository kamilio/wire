import { defineService } from "wire-core";
import type { JsonObject } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";

function slackAuthError(): Error {
  return new Error("slack cookie authentication is missing or expired. Run `wire slack login` once; other commands reuse saved cookies.");
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function markdownLinkLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function cleanText(text: string): string {
  return decodeEntities(text.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_match, id: string, label: string | undefined) => `@${label ?? id}`).replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<#([A-Z0-9]+)>/g, "#$1").replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1").replace(/<!(here|channel|everyone)>/g, "@$1").replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url: string, label: string) => `[${markdownLinkLabel(label)}](${url})`).replace(/<(https?:\/\/[^>]+)>/g, "$1").replace(/<(mailto:[^|>]+)\|([^>]+)>/g, "$2"));
}

async function api(runtime: RuntimeCapabilities, origin: string, token: string, cookie: string, method: string, parameters: Readonly<Record<string, string>>): Promise<JsonObject> {
  const body = new URLSearchParams({ token, ...parameters });
  const response = await runtime.http.request(`${origin}/api/${method}`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" }, body });
  const json = await response.json() as JsonObject;
  if (!response.ok) throw new Error(`Slack API ${method} failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  if (json["ok"] === false) throw new Error(`Slack API ${method} failed: ${json["error"] as string}`);
  return json;
}

function formatTimestamp(timestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Number(timestamp) * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]} ${values["hour"]}:${values["minute"]}`;
}

function messageParts(url: URL): Readonly<{ channel: string; rawTimestamp: string }> | undefined {
  const archive = /^\/archives\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname.endsWith(".slack.com") && archive !== null) return Object.freeze({ channel: archive[1]!, rawTimestamp: archive[2]! });
  const app = /^\/client\/[^/]+\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname === "app.slack.com" && app !== null) return Object.freeze({ channel: app[1]!, rawTimestamp: app[2]! });
  const thread = /^\/client\/[^/]+\/([^/]+)\/thread\/[^-]+-([0-9]+\.[0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname === "app.slack.com" && thread !== null) return Object.freeze({ channel: thread[1]!, rawTimestamp: thread[2]! });
  return undefined;
}

function slackTimestamp(rawTimestamp: string): string {
  if (rawTimestamp.includes(".")) return rawTimestamp;
  return `${rawTimestamp.slice(0, -6)}.${rawTimestamp.slice(-6)}`;
}

export const slackService = defineService<RuntimeCapabilities>({
  name: "slack",
  matches: (url) => messageParts(url) !== undefined,
  parse: (url) => {
    const parts = messageParts(url)!;
    const timestamp = slackTimestamp(parts.rawTimestamp);
    const threadTimestamp = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts")! : timestamp;
    return Object.freeze({ service: "slack", identifier: `${parts.channel}:${threadTimestamp}`, type: "message-thread", channel_id: parts.channel, timestamp, thread_timestamp: threadTimestamp });
  },
  fetch: async (runtime, url, source) => {
    const cookies = await runtime.cookies.loadSaved("slack");
    if (cookies === null) throw slackAuthError();
    const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
    const metadata = await runtime.cookies.metadata("slack");
    const origin = new URL(url).hostname === "app.slack.com" ? metadata["origin"]! : new URL(url).origin;
    const token = metadata["token"]!;
    const replies: JsonObject[] = [];
    let cursor: string | undefined;
    do {
      const response = await api(runtime, origin, token, cookie, "conversations.replies", { channel: source["channel_id"] as string, ts: source["thread_timestamp"] as string, limit: "999", ...(cursor === undefined ? {} : { cursor }) });
      replies.push(...response["messages"] as readonly JsonObject[]);
      cursor = ((response["response_metadata"] as JsonObject | undefined)?.["next_cursor"] as string | undefined);
    } while (cursor !== undefined && cursor !== "");
    const userCache = new Map<string, string>();
    const botCache = new Map<string, string>();
    const resolveUser = async (id: string) => {
      if (!userCache.has(id)) {
        const profile = await api(runtime, origin, token, cookie, "users.info", { user: id });
        const user = profile["user"] as JsonObject;
        const userProfile = user["profile"] as JsonObject | undefined;
        const realName = userProfile === undefined ? undefined : userProfile["real_name"] as string | undefined;
        const name = user["name"] as string | undefined;
        userCache.set(id, realName !== undefined && realName !== "" ? realName : name !== undefined && name !== "" ? name : id);
      }
      return userCache.get(id)!;
    };
    const messages = [];
    for (const raw of replies) {
      const userId = raw["user"] as string | undefined;
      let userName: string;
      if (userId !== undefined) userName = await resolveUser(userId);
      else if (raw["username"] !== undefined) userName = raw["username"] as string;
      else if (raw["bot_profile"] !== undefined) userName = (raw["bot_profile"] as JsonObject)["name"] as string;
      else if (raw["bot_id"] !== undefined) {
        const botId = raw["bot_id"] as string;
        if (!botCache.has(botId)) botCache.set(botId, ((await api(runtime, origin, token, cookie, "bots.info", { bot: botId }))["bot"] as JsonObject)["name"] as string);
        userName = botCache.get(botId)!;
      } else userName = "unknown";
      const text = raw["text"] as string;
      const files = raw["files"] === undefined ? [] : (raw["files"] as readonly JsonObject[]).map((file) => Object.freeze({ name: file["name"] as string, url: file["url_private"] as string }));
      messages.push({ ts: raw["ts"] as string, user_id: userId ?? "unknown", user_name: userName, text, files });
    }
    const mentioned = new Set(messages.flatMap((message) => [...message.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1]!)));
    for (const id of mentioned) await resolveUser(id);
    for (const message of messages) {
      const cleaned = cleanText(message.text.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (_match, id: string) => `@${userCache.get(id)!}`)).replace(/```([^\n])/g, "```\n$1").replace(/([^\n])```/g, "$1\n```");
      const fileLines = message.files.map((file) => `- [${markdownLinkLabel(file.name)}](${file.url})`).join("\n");
      message.text = cleaned.trim() === "" ? fileLines : fileLines === "" ? cleaned : `${cleaned}\n\n${fileLines}`;
    }
    const timezone = runtime.clock.localTimezone();
    const date = formatTimestamp(messages[0]!.ts, timezone).slice(0, 10);
    const titleText = messages[0]!.text.replace(/https?:\/\/\S+/g, "").slice(0, 30).replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
    const lines: string[] = [];
    for (const message of messages) lines.push(`## ${message.user_name} — ${formatTimestamp(message.ts, timezone)}`, "", message.text, "");
    return Object.freeze({ title: `${date}-${titleText}`, markdown: `${lines.join("\n").trimEnd()}\n`, data: { channel_id: source["channel_id"] as string, messages } });
  },
});
