import { defineService } from "wire-core";
function chatgptAuthError() {
    return new Error("ChatGPT authentication is missing or expired. Run `wire chatgpt login` once; other commands reuse saved cookies.");
}
function cookieHeader(cookies) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function headers(cookies, referer) {
    return {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "oai-device-id": cookies.find((cookie) => cookie.name === "oai-did").value,
        "oai-language": "en-US",
        referer,
        cookie: cookieHeader(cookies),
    };
}
function formatUpdateTime(value) {
    if (typeof value === "string")
        return value;
    return new Date(value * 1000).toISOString();
}
function orderedMessages(conversation) {
    const mapping = conversation["mapping"];
    if (typeof conversation["current_node"] === "string") {
        const path = [];
        let nodeId = conversation["current_node"];
        while (nodeId !== null) {
            const node = mapping[nodeId];
            const message = node["message"];
            if (message !== null)
                path.push(message);
            nodeId = node["parent"];
        }
        return path.reverse();
    }
    const messages = [];
    for (const node of Object.values(mapping)) {
        const message = node["message"];
        if (message !== null)
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
function messageContent(message) {
    const content = message["content"];
    if (content["content_type"] === "text") {
        const parts = [];
        for (const part of content["parts"]) {
            if (typeof part === "string") {
                const stripped = part.trim();
                if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
                    parts.push(multimodalText(JSON.parse(stripped)));
                }
                else
                    parts.push(part);
            }
            else
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
    if (content["content_type"] === "thoughts" || content["content_type"] === "reasoning_recap" || content["content_type"] === "model_editable_context")
        return "";
    const body = messageContent(message).trim();
    const role = message["author"]["role"];
    if (role === "assistant" && (body.startsWith('{"content_type"') || body.startsWith('{"content_type":'))) {
        const parsed = JSON.parse(body);
        if (parsed["content_type"] === "thoughts" || parsed["content_type"] === "reasoning_recap" || parsed["content_type"] === "model_editable_context")
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
    matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && /^\/c\/[^/]+\/?$/.test(url.pathname),
    parse: (url) => Object.freeze({ service: "chatgpt", identifier: /^\/c\/([^/]+)\/?$/.exec(url.pathname)[1], type: "message-thread" }),
    fetch: async (runtime, url, source) => {
        const cookies = await runtime.cookies.loadSaved("chatgpt");
        if (cookies === null)
            throw chatgptAuthError();
        const sessionHeaders = headers(cookies, "https://chatgpt.com/");
        const sessionResponse = await runtime.http.request("https://chatgpt.com/api/auth/session", { headers: sessionHeaders });
        const sessionText = await sessionResponse.text();
        if (!sessionText.startsWith("{"))
            throw chatgptAuthError();
        const session = JSON.parse(sessionText);
        if ("error" in session)
            throw chatgptAuthError();
        const account = session["account"];
        const conversationHeaders = {
            ...sessionHeaders,
            authorization: `Bearer ${session["accessToken"]}`,
            "chatgpt-account-id": account["id"],
            referer: url,
        };
        const conversationResponse = await runtime.http.request(`https://chatgpt.com/backend-api/conversation/${encodeURIComponent(source.identifier)}`, { headers: conversationHeaders });
        if (!conversationResponse.ok)
            throw new Error(`ChatGPT conversation download failed. Run \`wire chatgpt login\`. ${await conversationResponse.text()}`);
        return fetchedConversation(await conversationResponse.json());
    },
});
//# sourceMappingURL=chatgpt.js.map