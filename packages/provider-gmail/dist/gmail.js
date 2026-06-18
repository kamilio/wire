import { defineService } from "wire-core";
function decode(data) {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function entities(text) {
    return text.replace(/&nbsp;/g, "\u00a0").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}
function stripTags(html) {
    return html.replace(/<[^>]+>/g, "");
}
function htmlText(html) {
    return entities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => `[${entities(stripTags(label)).trim()}](${entities(href)})`).replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((line) => line.trim()).filter((line) => line !== "").join("\n");
}
function body(payload) {
    const mimeType = payload["mimeType"];
    if (mimeType === "text/plain")
        return decode(payload["body"]["data"]);
    if (mimeType === "text/html")
        return htmlText(decode(payload["body"]["data"]));
    if (payload["parts"] === undefined)
        return "";
    const parts = payload["parts"];
    if (mimeType === "multipart/alternative") {
        const plain = parts.find((part) => part["mimeType"] === "text/plain");
        const html = parts.find((part) => part["mimeType"] === "text/html");
        if (plain !== undefined && body(plain).trim() !== "")
            return body(plain);
        if (html !== undefined)
            return body(html);
        if (plain !== undefined)
            return body(plain);
    }
    return parts.filter((part) => part["mimeType"] !== "application/octet-stream").map(body).join("\n");
}
function threadIdentifier(url) {
    const fragmentPath = url.hash.slice(1).split("?")[0];
    const parts = fragmentPath.replace(/\/$/, "").split("/");
    const identifier = parts.at(-1);
    if (identifier === "")
        return undefined;
    if (["search", "label"].includes(parts[0]))
        return parts.length >= 3 ? identifier : undefined;
    if (parts[0] === "category")
        return parts.length === 3 ? identifier : undefined;
    if (["all", "drafts", "important", "inbox", "sent", "snoozed", "spam", "starred", "trash"].includes(parts[0]))
        return parts.length === 2 ? identifier : undefined;
    return undefined;
}
async function gmailJson(response, label) {
    const body = await response.json();
    if (!response.ok) {
        const error = body["error"];
        throw new Error(`Gmail API ${label} failed: HTTP ${response.status} ${error["message"]}`);
    }
    return body;
}
export const gmailService = defineService({
    name: "gmail",
    matches: (url) => url.hostname === "mail.google.com" && threadIdentifier(url) !== undefined,
    parse: (url) => {
        return Object.freeze({ service: "gmail", identifier: threadIdentifier(url), type: "email-thread" });
    },
    fetch: async (runtime, url, source) => {
        const token = await runtime.gmailTokens.load();
        const response = await runtime.http.request(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(source.identifier)}?format=full`, { headers: { Authorization: `Bearer ${token.token}` } });
        const thread = await gmailJson(response, "thread fetch");
        const messages = thread["messages"].map((message) => {
            const payload = message["payload"];
            const headers = Object.fromEntries(payload["headers"].map((header) => [header["name"].toLowerCase(), header["value"]]));
            const to = headers["to"];
            const renderedBody = body(payload);
            if (to === undefined)
                return Object.freeze({ id: message["id"], from: headers["from"], date: headers["date"], subject: headers["subject"], body: renderedBody });
            return Object.freeze({ id: message["id"], from: headers["from"], to, date: headers["date"], subject: headers["subject"], body: renderedBody });
        });
        const lines = [`# ${messages[0].subject}`, "", `- Source: ${url}`, `- Thread ID: ${source.identifier}`, ""];
        for (const message of messages) {
            lines.push(`## ${message.from} — ${message.date}`, "");
            if ("to" in message)
                lines.push(`**To:** ${message.to}`, "");
            lines.push(message.body, "");
        }
        return Object.freeze({ title: messages[0].subject, markdown: `${lines.join("\n").trimEnd()}\n`, data: { messages } });
    },
});
//# sourceMappingURL=gmail.js.map