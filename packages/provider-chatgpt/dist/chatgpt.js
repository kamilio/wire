import { defineService } from "wire-core";
import { connectChatgpt, object } from "./client.js";
import { downloadChatgpt } from "./download.js";
function formatUpdateTime(value) {
    if (typeof value === "string")
        return value;
    return new Date(value * 1000).toISOString();
}
function orderedMessages(conversation) {
    const mapping = conversation["mapping"];
    if (typeof conversation["current_node"] === "string") {
        const path = [];
        const visited = new Set();
        let nodeId = conversation["current_node"];
        while (nodeId !== null) {
            if (visited.has(nodeId) || mapping[nodeId] === undefined)
                throw new Error("Invalid ChatGPT conversation branch");
            visited.add(nodeId);
            const node = mapping[nodeId];
            const message = node["message"];
            if (message != null)
                path.push(message);
            nodeId = typeof node["parent"] === "string" ? node["parent"] : null;
        }
        return path.reverse();
    }
    const messages = [];
    for (const node of Object.values(mapping)) {
        const message = node["message"];
        if (message != null)
            messages.push(message);
    }
    messages.sort((left, right) => {
        const leftTime = left["create_time"];
        const rightTime = right["create_time"];
        const leftKey = leftTime === null ? 0 : leftTime;
        const rightKey = rightTime === null ? 0 : rightTime;
        if (leftKey !== rightKey)
            return leftKey - rightKey;
        return left["id"].localeCompare(right["id"]);
    });
    return messages;
}
function multimodalText(value) {
    const parts = [];
    for (const part of value["parts"]) {
        if (typeof part === "string")
            parts.push(part);
        else if (part["content_type"] === "audio_transcription")
            parts.push(part["text"]);
        else if (part["content_type"] === "text")
            parts.push(part["text"]);
    }
    return parts.join("\n\n").trim();
}
function hiddenAssistantPayload(value) {
    const contentType = value["content_type"];
    return contentType === "thoughts" || contentType === "reasoning_recap" || contentType === "model_editable_context" || contentType === "tool_call" || value["product_query"] !== undefined;
}
function assistantPayloadText(value) {
    const stripped = value.trim();
    if (/^\{\s*"(?:content_type|product_query)"\s*:/.test(stripped))
        return JSON.parse(stripped);
    return null;
}
function messageContent(message) {
    const content = message["content"];
    const role = message["author"]["role"];
    if (content["content_type"] === "text") {
        const parts = [];
        for (const part of content["parts"]) {
            if (typeof part === "string") {
                const stripped = part.trim();
                if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
                    parts.push(multimodalText(JSON.parse(stripped)));
                }
                else if (role === "assistant") {
                    const payload = assistantPayloadText(stripped);
                    if (payload === null || !hiddenAssistantPayload(payload))
                        parts.push(part);
                }
                else
                    parts.push(part);
            }
            else if (role !== "assistant" || !hiddenAssistantPayload(part))
                parts.push(JSON.stringify(part));
        }
        return parts.join("\n\n").trim();
    }
    if (content["content_type"] === "multimodal_text")
        return multimodalText(content);
    if (content["content_type"] === "code")
        return content["text"];
    return JSON.stringify(content);
}
function readableBody(message) {
    const content = message["content"];
    const recipient = message["recipient"];
    if (message["author"]["role"] === "assistant" && recipient !== undefined && recipient !== "all")
        return "";
    if (hiddenAssistantPayload(content))
        return "";
    const body = messageContent(message).trim();
    const role = message["author"]["role"];
    if (role === "assistant" && (body.startsWith('{"content_type"') || body.startsWith('{"content_type":'))) {
        const parsed = JSON.parse(body);
        if (hiddenAssistantPayload(parsed))
            return "";
    }
    return body.replace(/cite[^]+/g, "").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}
function conversationMarkdown(conversation) {
    const url = `https://chatgpt.com/c/${conversation["conversation_id"]}`;
    const lines = [
        `# ${conversation["title"]}`,
        "",
        `[Open in ChatGPT](${url})`,
        "",
    ];
    const entries = [];
    for (const message of orderedMessages(conversation)) {
        const role = message["author"]["role"];
        if (role === "system" || role === "tool")
            continue;
        const body = readableBody(message);
        if (body === "")
            continue;
        const label = role === "user" ? "You" : role === "assistant" ? "ChatGPT" : `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
        if (entries.length > 0 && entries[entries.length - 1][0] === label)
            entries[entries.length - 1][1].push(body);
        else
            entries.push([label, [body]]);
    }
    for (const [label, bodies] of entries) {
        lines.push(`## ${label}`, "", bodies.join("\n\n"), "");
    }
    return `${lines.join("\n").trimEnd()}\n`;
}
function fetchedConversation(conversation) {
    const updated = formatUpdateTime(conversation["update_time"]);
    return Object.freeze({
        title: conversation["title"],
        markdown: conversationMarkdown(conversation),
        data: { conversation_id: conversation["conversation_id"], update_time: updated },
    });
}
export const chatgptService = defineService({
    name: "chatgpt",
    matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && (url.pathname === "/" || /^\/c\/[^/]+\/?$/.test(url.pathname) || /^\/g\/g-p-[^/]+\/project\/?$/.test(url.pathname) || /^\/g\/[^/]+\/c\/[^/]+\/?$/.test(url.pathname)),
    parse: (url) => {
        if (url.pathname === "/")
            return Object.freeze({ service: "chatgpt", identifier: "history", type: "project" });
        const project = /^\/g\/(g-p-[^/]+)\/project\/?$/.exec(url.pathname);
        if (project !== null)
            return Object.freeze({ service: "chatgpt", identifier: project[1], type: "project" });
        return Object.freeze({ service: "chatgpt", identifier: /\/c\/([^/]+)\/?$/.exec(url.pathname)[1], type: "message-thread" });
    },
    download: (runtime, url, source, write) => downloadChatgpt(runtime, url, source, write, conversationMarkdown),
    fetch: async (runtime, url, source) => {
        if (source.type === "project")
            throw new Error("Use `wire download <url>` to export ChatGPT history or projects as a directory.");
        const session = await connectChatgpt(runtime, url);
        const conversation = await session.forAccount(session.accountId).json(`/backend-api/conversation/${encodeURIComponent(source.identifier)}`);
        return fetchedConversation(object(conversation));
    },
});
//# sourceMappingURL=chatgpt.js.map