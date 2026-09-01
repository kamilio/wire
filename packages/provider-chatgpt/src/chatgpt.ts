import { defineService } from "wire-core";
import type { FetchedDocument, JsonObject, JsonValue } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
import { connectChatgpt, object } from "./client.js";
import { downloadChatgpt } from "./download.js";

function formatUpdateTime(value: JsonValue): string {
  if (typeof value === "string") return value;
  return new Date((value as number) * 1000).toISOString();
}

function orderedMessages(conversation: JsonObject): readonly JsonObject[] {
  const mapping = conversation["mapping"] as JsonObject;
  if (typeof conversation["current_node"] === "string") {
    const path: JsonObject[] = [];
    const visited = new Set<string>();
    let nodeId = conversation["current_node"] as string | null;
    while (nodeId !== null) {
      if (visited.has(nodeId) || mapping[nodeId] === undefined) throw new Error("Invalid ChatGPT conversation branch");
      visited.add(nodeId);
      const node = mapping[nodeId] as JsonObject;
      const message = node["message"] as JsonObject | null;
      if (message != null) path.push(message);
      nodeId = typeof node["parent"] === "string" ? node["parent"] : null;
    }
    return path.reverse();
  }
  const messages: JsonObject[] = [];
  for (const node of Object.values(mapping)) {
    const message = (node as JsonObject)["message"] as JsonObject | null;
    if (message != null) messages.push(message);
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

function hiddenAssistantPayload(value: JsonObject): boolean {
  const contentType = value["content_type"];
  return contentType === "thoughts" || contentType === "reasoning_recap" || contentType === "model_editable_context" || contentType === "tool_call" || value["product_query"] !== undefined;
}

function assistantPayloadText(value: string): JsonObject | null {
  const stripped = value.trim();
  if (/^\{\s*"(?:content_type|product_query)"\s*:/.test(stripped)) return JSON.parse(stripped) as JsonObject;
  return null;
}

function messageContent(message: JsonObject): string {
  const content = message["content"] as JsonObject;
  const role = (message["author"] as JsonObject)["role"] as string;
  if (content["content_type"] === "text") {
    const parts: string[] = [];
    for (const part of content["parts"] as readonly JsonValue[]) {
      if (typeof part === "string") {
        const stripped = part.trim();
        if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
          parts.push(multimodalText(JSON.parse(stripped) as JsonObject));
        } else if (role === "assistant") {
          const payload = assistantPayloadText(stripped);
          if (payload === null || !hiddenAssistantPayload(payload)) parts.push(part);
        } else parts.push(part);
      } else if (role !== "assistant" || !hiddenAssistantPayload(part as JsonObject)) parts.push(JSON.stringify(part));
    }
    return parts.join("\n\n").trim();
  }
  if (content["content_type"] === "multimodal_text") return multimodalText(content);
  if (content["content_type"] === "code") return content["text"] as string;
  return JSON.stringify(content);
}

function readableBody(message: JsonObject): string {
  const content = message["content"] as JsonObject;
  const recipient = message["recipient"];
  if ((message["author"] as JsonObject)["role"] === "assistant" && recipient !== undefined && recipient !== "all") return "";
  if (hiddenAssistantPayload(content)) return "";
  const body = messageContent(message).trim();
  const role = (message["author"] as JsonObject)["role"] as string;
  if (role === "assistant" && (body.startsWith('{"content_type"') || body.startsWith('{"content_type":'))) {
    const parsed = JSON.parse(body) as JsonObject;
    if (hiddenAssistantPayload(parsed)) return "";
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
  matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && (url.pathname === "/" || /^\/c\/[^/]+\/?$/.test(url.pathname) || /^\/g\/g-p-[^/]+\/project\/?$/.test(url.pathname) || /^\/g\/[^/]+\/c\/[^/]+\/?$/.test(url.pathname)),
  parse: (url) => {
    if (url.pathname === "/") return Object.freeze({ service: "chatgpt", identifier: "history", type: "project" });
    const project = /^\/g\/(g-p-[^/]+)\/project\/?$/.exec(url.pathname);
    if (project !== null) return Object.freeze({ service: "chatgpt", identifier: project[1]!, type: "project" });
    return Object.freeze({ service: "chatgpt", identifier: /\/c\/([^/]+)\/?$/.exec(url.pathname)![1]!, type: "message-thread" });
  },
  download: (runtime, url, source, write) => downloadChatgpt(runtime, url, source, write, conversationMarkdown),
  fetch: async (runtime, url, source) => {
    if (source.type === "project") throw new Error("Use `wire download <url>` to export ChatGPT history or projects as a directory.");
    const session = await connectChatgpt(runtime, url);
    const conversation = await session.forAccount(session.accountId).json(`/backend-api/conversation/${encodeURIComponent(source.identifier)}`);
    return fetchedConversation(object(conversation));
  },
});
