import { defineService } from "wire-core";
import { parse } from "toolcraft/design/render-markdown";
function slackAuthError() {
    return new Error("slack cookie authentication is missing or expired. Run `wire slack login` once; other commands reuse saved cookies.");
}
function decodeEntities(text) {
    return text.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
}
function cleanText(text) {
    return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
        if (index % 2 === 1)
            return part.startsWith("```") ? `\n${codeBlock(decodeEntities(part.slice(3, -3).replace(/^\n|\n$/g, "")))}\n` : codeSpan(decodeEntities(part.slice(1, -1)));
        return part.split(/(<[^>]+>)/g).map((value, position) => {
            if (position % 2 === 0)
                return decodeEntities(value).replace(/[<>]/g, "\\$&").replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1**$2**").replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?:;])/g, "$1~~$2~~");
            return decodeEntities(value.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_match, id, label) => `@${label === undefined ? id : label}`).replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<#([A-Z0-9]+)>/g, "#$1").replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1").replace(/<!(here|channel|everyone)>/g, "@$1").replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownText(label)}](${url})`).replace(/<(https?:\/\/[^>]+)>/g, "$1").replace(/<(mailto:[^|>]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownText(label)}](${url})`).replace(/<!date\^[^|]+\|([^>]+)>/g, "$1"));
        }).join("");
    }).join("").trimEnd();
}
function markdownText(value) {
    return value.replace(/[\\`*_{}\[\]<>~|]/g, "\\$&").replace(/^(\s*)([#>+\-=])/gm, "$1\\$2").replace(/^(\s*[0-9]+)([.)])/gm, "$1\\$2");
}
function codeSpan(value) {
    const fence = "`".repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
    const padding = value.startsWith("`") || value.endsWith("`") || /^ .* $/.test(value) && value.trim() !== "" ? " " : "";
    return `${fence}${padding}${value}${padding}${fence}`;
}
function codeBlock(value) {
    const fence = "`".repeat(Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
    return `${fence}\n${value}\n${fence}`;
}
function inlinePlain(nodes) {
    return nodes.map((node) => {
        if ("value" in node)
            return node.value;
        if ("children" in node)
            return inlinePlain(node.children);
        if (node.type === "image")
            return node.alt;
        if (node.type === "break")
            return "\n";
        if (node.type === "footnoteReference")
            return `[${node.label}]`;
        throw new Error(`Unsupported Slack inline node: ${node.type}`);
    }).join("");
}
function slackInline(nodes, style, markdown) {
    const result = nodes.flatMap((node) => {
        if (node.type === "strong" || node.type === "emphasis" || node.type === "strikethrough")
            return slackInline(node.children, { ...style, [node.type === "strong" ? "bold" : node.type === "emphasis" ? "italic" : "strike"]: true }, markdown);
        if (node.type === "link" || node.type === "image") {
            const url = new URL(node.url);
            if (url.protocol === "slack:" && url.hostname === "user")
                return [{ type: "user", user_id: url.searchParams.get("id"), style }];
            if (url.protocol === "slack:" && url.hostname === "channel")
                return [{ type: "channel", channel_id: url.searchParams.get("id"), style }];
            if (!["http:", "https:", "mailto:", "slack:"].includes(url.protocol))
                throw new Error(`Unsupported Slack link protocol: ${url.protocol}`);
            if (node.type === "image")
                return [{ type: "link", url: node.url, text: node.alt === "" ? node.url : node.alt, style }];
            return slackInline(node.children, style, markdown).map((element) => ({ type: "link", url: node.url, text: element["type"] === "text" ? element["text"] : richInline([element], new Map()), style: element["style"] }));
        }
        if (node.type === "inlineCode")
            return [{ type: "text", text: node.value, style: { ...style, code: true } }];
        if (node.type === "break")
            return [{ type: "text", text: "\n", style }];
        if (node.type === "footnoteReference")
            return [{ type: "text", text: `[${node.label}]`, style }];
        if (node.type !== "text" && node.type !== "html")
            throw new Error(`Unsupported Slack inline node: ${node.type}`);
        const elements = [];
        let start = 0;
        const original = Buffer.from(markdown).subarray(node.range.start, node.range.end).toString();
        const originalMentions = [...original.matchAll(/(\\*)<(@[A-Z0-9]+|#[A-Z0-9]+(?:\|[^>]+)?|!(?:here|channel|everyone)|!subteam\^[A-Z0-9]+(?:\|[^>]+)?)(\\*)>/g)];
        let mentionIndex = 0;
        for (const match of node.value.matchAll(/<@([A-Z0-9]+)>|<#([A-Z0-9]+)(?:\|[^>]+)?>|<!(here|channel|everyone)>|<!subteam\^([A-Z0-9]+)(?:\|[^>]+)?>/g)) {
            const originalMention = originalMentions[mentionIndex++];
            if (originalMention === undefined || originalMention[1].length % 2 === 1 || originalMention[3].length % 2 === 1)
                continue;
            if (match.index > start)
                elements.push({ type: "text", text: node.value.slice(start, match.index), style });
            if (match[1] !== undefined)
                elements.push({ type: "user", user_id: match[1], style });
            if (match[2] !== undefined)
                elements.push({ type: "channel", channel_id: match[2], style });
            if (match[3] !== undefined)
                elements.push({ type: "broadcast", range: match[3], style });
            if (match[4] !== undefined)
                elements.push({ type: "usergroup", usergroup_id: match[4], style });
            start = match.index + match[0].length;
        }
        if (start < node.value.length)
            elements.push({ type: "text", text: node.value.slice(start), style });
        return elements;
    });
    const merged = [];
    for (const element of result) {
        const previous = merged.at(-1);
        if (previous?.["type"] === "text" && element["type"] === "text" && JSON.stringify(previous["style"]) === JSON.stringify(element["style"]))
            merged[merged.length - 1] = { ...previous, text: `${previous["text"]}${element["text"]}` };
        else
            merged.push(element);
    }
    return merged;
}
function slackSections(nodes, markdown, indent) {
    return nodes.flatMap((node) => {
        if (node.type === "paragraph" || node.type === "heading")
            return [{ type: "rich_text_section", elements: slackInline(node.children, node.type === "heading" ? { bold: true } : {}, markdown) }];
        if (node.type === "code")
            return [{ type: "rich_text_preformatted", elements: [{ type: "text", text: node.value }] }];
        if (node.type === "blockquote" || node.type === "alert") {
            const elements = [];
            if (node.type === "alert")
                elements.push({ type: "text", text: `${node.kind}\n`, style: { bold: true } });
            for (const section of slackSections(node.children, markdown, indent)) {
                if (elements.length > 0)
                    elements.push({ type: "text", text: "\n" });
                if (section["type"] === "rich_text_list") {
                    for (const item of section["elements"])
                        elements.push({ type: "text", text: "• " }, ...item["elements"], { type: "text", text: "\n" });
                }
                else if (section["type"] === "rich_text_preformatted")
                    elements.push(...section["elements"].map((element) => ({ ...element, style: { code: true } })));
                else
                    elements.push(...section["elements"]);
            }
            return [{ type: "rich_text_quote", elements }];
        }
        if (node.type === "list") {
            const sections = [];
            let offset = node.ordered && node.start !== undefined ? node.start - 1 : 0;
            for (const item of node.children) {
                if (item.type !== "listItem")
                    throw new Error(`Unexpected list child: ${item.type}`);
                let first = true;
                for (const child of item.children) {
                    if (child.type === "list")
                        sections.push(...slackSections([child], markdown, indent + 1));
                    else {
                        const elements = child.type === "paragraph" ? slackInline(child.children, {}, markdown) : [{ type: "text", text: child.type === "code" ? child.value : inlinePlain([child]), ...(child.type === "code" ? { style: { code: true } } : {}) }];
                        if (first && item.checked !== undefined)
                            elements.unshift({ type: "text", text: item.checked ? "☑ " : "☐ " });
                        if (first)
                            sections.push({ type: "rich_text_list", style: node.ordered ? "ordered" : "bullet", indent, ...(node.ordered ? { offset } : {}), elements: [{ type: "rich_text_section", elements }] });
                        else
                            sections.push({ type: "rich_text_section", elements: [{ type: "text", text: "  ".repeat(indent + 1) }, ...elements] });
                        first = false;
                    }
                }
                offset += 1;
            }
            return sections;
        }
        if (node.type === "table" || node.type === "frontmatter") {
            const range = node.range;
            return [{ type: "rich_text_preformatted", elements: [{ type: "text", text: Buffer.from(markdown).subarray(range.start, range.end).toString().trimEnd() }] }];
        }
        if (node.type === "thematicBreak")
            return [{ type: "rich_text_section", elements: [{ type: "text", text: "──────────" }] }];
        if (node.type === "html")
            return [{ type: "rich_text_section", elements: [{ type: "text", text: node.value }] }];
        if (node.type === "footnoteDefinition")
            return [{ type: "rich_text_section", elements: [{ type: "text", text: `[${node.label}] ` }, ...slackInline(node.children.flatMap((child) => child.type === "paragraph" ? child.children : [child]), {}, markdown)] }];
        throw new Error(`Unsupported Slack block node: ${node.type}`);
    });
}
export function markdownToSlackBlocks(markdown) {
    if (markdown.trim() === "")
        throw new Error("Slack message must not be empty");
    if (markdown.length > 40000)
        throw new Error("Slack message exceeds 40000 characters");
    markdown = markdown.replace(/\r\n?/g, "\n");
    const ast = parse(markdown).ast;
    if (ast.type !== "root")
        throw new Error("Expected Markdown document");
    return [{ type: "rich_text", elements: slackSections(ast.children, markdown, 0) }];
}
function richInline(elements, users) {
    let output = "";
    let active = [];
    for (const element of elements) {
        const style = element["style"];
        let text;
        switch (element["type"]) {
            case "text":
                text = style?.["code"] === true ? codeSpan(element["text"]) : markdownText(element["text"]);
                break;
            case "link":
                text = `[${markdownText(element["text"] === undefined ? element["url"] : element["text"])}](<${element["url"].replace(/>/g, "%3E")}>)`;
                break;
            case "user": {
                const id = element["user_id"];
                text = users.has(id) ? `[@${markdownText(users.get(id))}](slack://user?id=${id})` : `<@${id}>`;
                break;
            }
            case "channel":
                text = `<#${element["channel_id"]}>`;
                break;
            case "usergroup":
                text = `<!subteam^${element["usergroup_id"]}>`;
                break;
            case "broadcast":
                text = `<!${element["range"]}>`;
                break;
            case "emoji":
                text = typeof element["unicode"] === "string" ? String.fromCodePoint(...element["unicode"].split("-").map((part) => Number.parseInt(part, 16))) : `:${element["name"]}:`;
                break;
            case "date":
                text = element["fallback"] === undefined ? new Date(Number(element["timestamp"]) * 1000).toISOString() : markdownText(element["fallback"]);
                break;
            case "color":
                text = codeSpan(element["value"]);
                break;
            default: throw new Error(`Unsupported Slack rich-text element: ${element["type"]}`);
        }
        const markers = [style?.["bold"] === true ? "**" : "", style?.["italic"] === true ? "*" : "", style?.["strike"] === true ? "~~" : ""].filter((marker) => marker !== "");
        const next = [...active.filter((marker) => markers.includes(marker)), ...markers.filter((marker) => !active.includes(marker))];
        let common = 0;
        while (common < active.length && active[common] === next[common])
            common += 1;
        const trailing = /\s*$/.exec(output)[0];
        output = output.slice(0, output.length - trailing.length) + active.slice(common).reverse().join("") + trailing;
        const leading = /^\s*/.exec(text)[0];
        output += leading + next.slice(common).join("") + text.slice(leading.length);
        active = next;
    }
    const trailing = /\s*$/.exec(output)[0];
    return output.slice(0, output.length - trailing.length) + active.reverse().join("") + trailing;
}
export function slackBlocksToMarkdown(blocks, users) {
    const render = (block) => {
        const elements = block["elements"];
        switch (block["type"]) {
            case "rich_text": {
                const output = [];
                for (const [index, child] of elements.entries()) {
                    const previous = elements[index - 1];
                    const adjacentLists = child["type"] === "rich_text_list" && previous?.["type"] === "rich_text_list" && (child["style"] === previous["style"] || child["indent"] !== previous["indent"]);
                    output.push(`${index === 0 ? "" : adjacentLists ? "\n" : "\n\n"}${render(child)}`);
                }
                return output.join("");
            }
            case "rich_text_section": return richInline(elements, users);
            case "rich_text_preformatted": return codeBlock(elements.map((element) => element["text"] === undefined ? element["url"] : element["text"]).join(""));
            case "rich_text_quote": return richInline(elements, users).split("\n").map((line) => `> ${line}`).join("\n");
            case "rich_text_list": return elements.map((element, index) => {
                const indent = block["indent"] === undefined ? 0 : block["indent"];
                const offset = block["offset"] === undefined ? 0 : block["offset"];
                const prefix = block["style"] === "ordered" ? `${offset + index + 1}. ` : "- ";
                return `${"    ".repeat(indent)}${prefix}${richInline(element["elements"], users).replace(/\n/g, `\n${"    ".repeat(indent)}${" ".repeat(prefix.length)}`)}`;
            }).join("\n");
            case "section": return [...(block["text"] === undefined ? [] : [render(block["text"])]), ...(block["fields"] === undefined ? [] : block["fields"].map(render))].join("\n\n");
            case "mrkdwn": return cleanText(block["text"]);
            case "plain_text": return markdownText(block["text"]);
            case "header": return `## ${render(block["text"])}`;
            case "divider": return "---";
            case "context": return elements.map(render).join(" · ");
            case "image": return `![${markdownText(block["alt_text"])}](<${block["image_url"]}>)`;
            case "actions": return elements.map(render).join(" · ");
            case "button": return block["url"] === undefined ? render(block["text"]) : `[${render(block["text"])}](<${block["url"]}>)`;
            default: throw new Error(`Unsupported Slack block: ${block["type"]}`);
        }
    };
    return blocks.map(render).join("\n\n");
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
function channelParts(url) {
    if (!url.hostname.endsWith(".slack.com"))
        return undefined;
    const match = /^\/archives\/([CDG][A-Z0-9]+)\/?$/.exec(url.pathname);
    if (match !== null)
        return match[1];
    if (url.hostname === "app.slack.com")
        return /^\/client\/[^/]+\/([CDG][A-Z0-9]+)\/?$/.exec(url.pathname)?.[1];
    return undefined;
}
async function slackSession(runtime) {
    const cookies = await runtime.cookies.loadSaved("slack");
    if (cookies === null)
        throw slackAuthError();
    const metadata = await runtime.cookies.metadata("slack");
    return { origin: metadata["origin"], token: metadata["token"], cookie: cookies.map((value) => `${value.name}=${value.value}`).join("; ") };
}
export async function sendSlackMessage(runtime, destination, markdown) {
    const blocks = markdownToSlackBlocks(markdown);
    const session = await slackSession(runtime);
    const request = (method, parameters) => api(runtime, session.origin, session.token, session.cookie, method, parameters);
    let channel;
    let thread;
    if (destination.startsWith("https://")) {
        const url = new URL(destination);
        const message = messageParts(url);
        const channelId = channelParts(url);
        if (message === undefined && channelId === undefined)
            throw new Error(`Unsupported Slack destination: ${destination}`);
        if (message !== undefined) {
            channel = message.channel;
            thread = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts") : slackTimestamp(message.rawTimestamp);
            const response = await request("conversations.replies", { channel, ts: thread, limit: "1" });
            const selected = response["messages"][0];
            if (selected["thread_ts"] !== undefined)
                thread = selected["thread_ts"];
        }
        else
            channel = channelId;
    }
    else if (/^[CDG][A-Z0-9]+$/.test(destination))
        channel = destination;
    else {
        const name = destination.replace(/^#/, "");
        const found = [];
        let page = 1;
        let pages;
        do {
            const response = await request("search.modules.channels", { module: "channels", query: name, count: "100", page: String(page) });
            for (const item of response["items"])
                if (item["name"] === name)
                    found.push(item["id"]);
            pages = response["pagination"]["page_count"];
            page += 1;
        } while (page <= pages);
        if (found.length !== 1)
            throw new Error(`Expected one Slack channel named #${name}, found ${found.length}; use a channel ID or URL`);
        channel = found[0];
    }
    const posted = await request("chat.postMessage", { channel, text: markdown, blocks: JSON.stringify(blocks), unfurl_links: "false", unfurl_media: "false", parse: "none", mrkdwn: "false", ...(thread === undefined ? {} : { thread_ts: thread }) });
    const ts = posted["ts"];
    const url = `${session.origin}/archives/${posted["channel"]}/p${ts.replace(".", "")}${thread === undefined ? "" : `?thread_ts=${thread}`}`;
    return { channel: posted["channel"], ts, url, ...(thread === undefined ? {} : { thread_ts: thread }) };
}
export const slackService = defineService({
    name: "slack",
    matches: (url) => messageParts(url) !== undefined || channelParts(url) !== undefined,
    parse: (url) => {
        const channel = channelParts(url);
        if (channel !== undefined)
            return Object.freeze({ service: "slack", identifier: channel, type: "message-thread", channel_id: channel });
        const parts = messageParts(url);
        const timestamp = slackTimestamp(parts.rawTimestamp);
        const threadTimestamp = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts") : timestamp;
        return Object.freeze({ service: "slack", identifier: `${parts.channel}:${threadTimestamp}`, type: "message-thread", channel_id: parts.channel, timestamp, thread_timestamp: threadTimestamp });
    },
    fetch: async (runtime, url, source) => {
        const session = await slackSession(runtime);
        const origin = new URL(url).hostname === "app.slack.com" ? session.origin : new URL(url).origin;
        const { token, cookie } = session;
        const replies = [];
        let cursor;
        do {
            const response = await api(runtime, origin, token, cookie, source["thread_timestamp"] === undefined ? "conversations.history" : "conversations.replies", { channel: source["channel_id"], ...(source["thread_timestamp"] === undefined ? {} : { ts: source["thread_timestamp"] }), limit: "200", ...(cursor === undefined ? {} : { cursor }) });
            replies.push(...response["messages"]);
            cursor = response["response_metadata"]?.["next_cursor"];
        } while (cursor !== undefined && cursor !== "");
        if (source["thread_timestamp"] === undefined) {
            for (const parent of [...replies]) {
                if (typeof parent["reply_count"] !== "number" || parent["reply_count"] === 0)
                    continue;
                let cursor;
                do {
                    const response = await api(runtime, origin, token, cookie, "conversations.replies", { channel: source["channel_id"], ts: parent["ts"], limit: "200", ...(cursor === undefined ? {} : { cursor }) });
                    replies.push(...response["messages"].filter((message) => message["ts"] !== parent["ts"]));
                    cursor = response["response_metadata"]?.["next_cursor"];
                } while (cursor !== undefined && cursor !== "");
            }
            replies.sort((left, right) => left["ts"].localeCompare(right["ts"]));
        }
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
        for (const raw of replies) {
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
            const text = raw["text"];
            const files = raw["files"] === undefined ? [] : raw["files"].map((file) => Object.freeze({ name: file["name"], url: file["url_private"] }));
            messages.push({ ...raw, ts: raw["ts"], user_id: userId ?? "unknown", user_name: userName, text, raw_text: text, files });
        }
        const mentioned = new Set(replies.filter((raw) => raw["blocks"] === undefined || raw["blocks"].length === 0).flatMap((raw) => [...raw["text"].replace(/```[\s\S]*?```|`[^`\n]*`/g, "").matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1])));
        const visit = (value) => {
            if (Array.isArray(value)) {
                for (const child of value)
                    visit(child);
            }
            else if (value !== null && typeof value === "object") {
                const object = value;
                if (object["type"] === "user")
                    mentioned.add(object["user_id"]);
                for (const child of Object.values(object))
                    visit(child);
            }
        };
        for (const raw of replies) {
            visit(raw["blocks"]);
            visit(raw["attachments"]);
        }
        for (const id of mentioned)
            await resolveUser(id);
        for (const [index, message] of messages.entries()) {
            const raw = replies[index];
            const cleaned = raw["blocks"] !== undefined && raw["blocks"].length > 0 ? slackBlocksToMarkdown(raw["blocks"], userCache) : cleanText(message.text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => index % 2 === 1 ? part : part.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (_match, id) => `@${userCache.get(id)}`)).join(""));
            const fileLines = message.files.map((file) => `- [${markdownText(file.name)}](${file.url})`).join("\n");
            const attachments = raw["attachments"] === undefined ? [] : raw["attachments"].map((attachment) => {
                const parts = [];
                if (attachment["title"] !== undefined)
                    parts.push(attachment["title_link"] === undefined ? markdownText(attachment["title"]) : `[${markdownText(attachment["title"])}](<${attachment["title_link"]}>)`);
                if (attachment["pretext"] !== undefined)
                    parts.push(cleanText(attachment["pretext"]));
                if (attachment["text"] !== undefined)
                    parts.push(cleanText(attachment["text"]));
                if (attachment["blocks"] !== undefined)
                    parts.push(slackBlocksToMarkdown(attachment["blocks"], userCache));
                if (attachment["fields"] !== undefined)
                    for (const field of attachment["fields"])
                        parts.push(`**${markdownText(field["title"])}**: ${cleanText(field["value"])}`);
                if (attachment["image_url"] !== undefined)
                    parts.push(`![](<${attachment["image_url"]}>)`);
                if (attachment["footer"] !== undefined)
                    parts.push(markdownText(attachment["footer"]));
                return parts.join("\n\n");
            });
            message.text = [cleaned, ...attachments, fileLines].filter((part) => part.trim() !== "").join("\n\n");
        }
        const timezone = runtime.clock.localTimezone();
        if (messages.length === 0)
            return { title: source["channel_id"], markdown: "", data: { channel_id: source["channel_id"], messages: [] } };
        const date = formatTimestamp(messages[0].ts, timezone).slice(0, 10);
        const titleText = messages[0].text.replace(/https?:\/\/\S+/g, "").slice(0, 30).replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
        const lines = [];
        for (const [index, message] of messages.entries()) {
            lines.push(`## ${message.user_name} — ${formatTimestamp(message.ts, timezone)}`, "");
            const thread = replies[index]["thread_ts"];
            if (source["thread_timestamp"] === undefined && thread !== undefined && thread !== message.ts)
                lines.push(`[Thread](${origin}/archives/${source["channel_id"]}/p${thread.replace(".", "")})`, "");
            lines.push(message.text, "");
        }
        return Object.freeze({ title: `${date}-${titleText}`, markdown: `${lines.join("\n").trimEnd()}\n`, data: { channel_id: source["channel_id"], messages } });
    },
});
//# sourceMappingURL=slack.js.map