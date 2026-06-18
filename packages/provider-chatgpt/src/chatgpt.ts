import { defineService } from "wire-core";
import type { FetchedDocument, JsonObject, JsonValue } from "wire-core";
import type { Cookie, RuntimeCapabilities } from "wire-core";

function chatgptAuthError(): Error {
  return new Error("ChatGPT authentication is missing or expired. Run `wire chatgpt login` once; other commands reuse saved cookies.");
}

function cookieHeader(cookies: readonly Cookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function headers(cookies: readonly Cookie[], referer: string): Record<string, string> {
  return {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "oai-device-id": cookies.find((cookie) => cookie.name === "oai-did")!.value,
    "oai-language": "en-US",
    referer,
    cookie: cookieHeader(cookies),
  };
}

function formatUpdateTime(value: JsonValue): string {
  if (typeof value === "string") return value;
  return new Date((value as number) * 1000).toISOString();
}

function orderedMessages(conversation: JsonObject): readonly JsonObject[] {
  const mapping = conversation["mapping"] as JsonObject;
  if (typeof conversation["current_node"] === "string") {
    const path: JsonObject[] = [];
    let nodeId = conversation["current_node"] as string | null;
    while (nodeId !== null) {
      const node = mapping[nodeId] as JsonObject;
      const message = node["message"] as JsonObject | null;
      if (message !== null) path.push(message);
      nodeId = node["parent"] as string | null;
    }
    return path.reverse();
  }
  const messages: JsonObject[] = [];
  for (const node of Object.values(mapping)) {
    const message = (node as JsonObject)["message"] as JsonObject | null;
    if (message !== null) messages.push(message);
  }
  messages.sort((left, right) => {
    const leftTime = left["create_time"] as number | null;
    const rightTime = right["create_time"] as number | null;
    const leftKey = leftTime === null ? 0 : leftTime;
    const rightKey = rightTime === null ? 0 : rightTime;
    if (leftKey !== rightKey) return leftKey - rightKey;
    return (left["id"] as string).localeCompare(right["id"] as string);
  });
  return messages;
}

function multimodalText(value: JsonObject): string {
  const parts: string[] = [];
  for (const part of value["parts"] as readonly JsonValue[]) {
    if (typeof part === "string") parts.push(part);
    else if ((part as JsonObject)["content_type"] === "audio_transcription") parts.push((part as JsonObject)["text"] as string);
    else if ((part as JsonObject)["content_type"] === "text") parts.push((part as JsonObject)["text"] as string);
  }
  return parts.join("\n\n").trim();
}

function messageContent(message: JsonObject): string {
  const content = message["content"] as JsonObject;
  if (content["content_type"] === "text") {
    const parts: string[] = [];
    for (const part of content["parts"] as readonly JsonValue[]) {
      if (typeof part === "string") {
        const stripped = part.trim();
        if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
          parts.push(multimodalText(JSON.parse(stripped) as JsonObject));
        } else parts.push(part);
      } else parts.push(JSON.stringify(part));
    }
    return parts.join("\n\n").trim();
  }
  if (content["content_type"] === "multimodal_text") return multimodalText(content);
  if (content["content_type"] === "code") return content["text"] as string;
  return JSON.stringify(content);
}

function readableBody(message: JsonObject): string {
  const content = message["content"] as JsonObject;
  if (content["content_type"] === "thoughts" || content["content_type"] === "reasoning_recap" || content["content_type"] === "model_editable_context") return "";
  const body = messageContent(message).trim();
  const role = (message["author"] as JsonObject)["role"] as string;
  if (role === "assistant" && (body.startsWith('{"content_type"') || body.startsWith('{"content_type":'))) {
    const parsed = JSON.parse(body) as JsonObject;
    if (parsed["content_type"] === "thoughts" || parsed["content_type"] === "reasoning_recap" || parsed["content_type"] === "model_editable_context") return "";
  }
  return body.replace(/cite[^]+/g, "").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

function conversationMarkdown(conversation: JsonObject): string {
  const url = `https://chatgpt.com/c/${conversation["conversation_id"] as string}`;
  const lines = [
    `# ${conversation["title"] as string}`,
    "",
    `[Open in ChatGPT](${url})`,
    "",
  ];
  const entries: [string, string[]][] = [];
  for (const message of orderedMessages(conversation)) {
    const role = ((message["author"] as JsonObject)["role"] as string);
    if (role === "system" || role === "tool") continue;
    const body = readableBody(message);
    if (body === "") continue;
    const label = role === "user" ? "You" : role === "assistant" ? "ChatGPT" : `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
    if (entries.length > 0 && entries[entries.length - 1]![0] === label) entries[entries.length - 1]![1].push(body);
    else entries.push([label, [body]]);
  }
  for (const [label, bodies] of entries) {
    lines.push(`## ${label}`, "", bodies.join("\n\n"), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function fetchedConversation(conversation: JsonObject): FetchedDocument {
  const updated = formatUpdateTime(conversation["update_time"] as JsonValue);
  return Object.freeze({
    title: conversation["title"] as string,
    markdown: conversationMarkdown(conversation),
    data: { conversation_id: conversation["conversation_id"] as string, update_time: updated },
  });
}

export const chatgptService = defineService<RuntimeCapabilities>({
  name: "chatgpt",
  matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && /^\/c\/[^/]+\/?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "chatgpt", identifier: /^\/c\/([^/]+)\/?$/.exec(url.pathname)![1]!, type: "message-thread" }),
  fetch: async (runtime, url, source) => {
    const cookies = await runtime.cookies.loadSaved("chatgpt");
    if (cookies === null) throw chatgptAuthError();
    const sessionHeaders = headers(cookies, "https://chatgpt.com/");
    const sessionResponse = await runtime.http.request("https://chatgpt.com/api/auth/session", { headers: sessionHeaders });
    const sessionText = await sessionResponse.text();
    if (!sessionText.startsWith("{")) throw chatgptAuthError();
    const session = JSON.parse(sessionText) as JsonObject;
    if ("error" in session) throw chatgptAuthError();
    const account = session["account"] as JsonObject;
    const conversationHeaders = {
      ...sessionHeaders,
      authorization: `Bearer ${session["accessToken"] as string}`,
      "chatgpt-account-id": account["id"] as string,
      referer: url,
    };
    const conversationResponse = await runtime.http.request(`https://chatgpt.com/backend-api/conversation/${encodeURIComponent(source.identifier)}`, { headers: conversationHeaders });
    if (!conversationResponse.ok) throw new Error(`ChatGPT conversation download failed. Run \`wire chatgpt login\`. ${await conversationResponse.text()}`);
    return fetchedConversation(await conversationResponse.json() as JsonObject);
  },
});
