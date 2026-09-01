import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { chatgptService, composeWire, defineServiceCatalog, parseSourceUrl } from "../dist/index.js";

const origin = "https://chatgpt.com";
const projectId = "g-p-example";
const projectUrl = `${origin}/g/${projectId}/project`;
const catalog = defineServiceCatalog([chatgptService]);

function conversation(id) {
  return {
    conversation_id: id, title: "Same / unsafe title", update_time: 1, current_node: "reply",
    mapping: {
      root: { parent: null, message: null },
      user: { parent: "root", message: { id: "user", author: { role: "user" }, content: { content_type: "text", parts: ["Hello"] } } },
      reply: { parent: "user", message: { id: "reply", author: { role: "assistant" }, content: { content_type: "text", parts: ["Current answer"] } } },
      alternative: { parent: "user", message: { id: "alternative", author: { role: "assistant" }, content: { content_type: "text", parts: ["Other branch"] } } },
    },
  };
}

function project(id = projectId) {
  return { gizmo: { id, instructions: "Keep the entire project", display: { name: "../Same project" } }, files: [] };
}

function fixture(overrides = {}) {
  const calls = [];
  const writes = new Map();
  const binary = new Uint8Array([0, 255, 1, 128, 13, 10]);
  const runtime = {
    clock: { now: () => new Date("2026-09-01T17:00:00Z") },
    cookies: { loadSaved: async () => [{ name: "oai-did", value: "device" }, { name: "session", value: "private" }] },
    http: { request: async (input, options) => {
      const url = new URL(input);
      const account = options.headers["chatgpt-account-id"];
      calls.push({ url, options, account });
      const custom = await overrides.request?.(url, options, calls);
      if (custom !== undefined) return custom;
      const path = url.pathname;
      if (path === "/api/auth/session") return Response.json({ accessToken: "secret", account: { id: "account" } });
      if (path === "/backend-api/accounts/check/v4-2023-04-27") return Response.json({ accounts: { account: { account: { account_id: "account" } }, default: { account: { account_id: "account" } } } });
      if (path === "/backend-api/conversations") return Response.json({ items: url.searchParams.get("is_archived") === "true" ? [] : [{ id: "normal" }, { id: "project-chat", gizmo_id: projectId }], total: url.searchParams.get("is_archived") === "true" ? 0 : 2, offset: 0 });
      if (path === "/backend-api/gizmos/snorlax/sidebar") return Response.json({ items: [{ gizmo: project(), conversations: { items: [], cursor: null } }], cursor: null });
      if (path === `/backend-api/gizmos/${projectId}`) return Response.json(project());
      if (path === `/backend-api/gizmos/${projectId}/conversations`) return Response.json({ items: [{ id: "project-chat", gizmo_id: projectId }], cursor: null });
      if (path === `/backend-api/projects/${projectId}/connector_scopes`) return Response.json({ items: [], cursor: null });
      if (path.endsWith("/textdocs")) return Response.json([]);
      if (path.startsWith("/backend-api/conversation/")) return Response.json(conversation(path.split("/").pop()));
      if (path === "/backend-api/files/library/nodes") return Response.json({ items: [], cursor: null });
      if (["/backend-api/me", "/backend-api/user_system_messages", "/backend-api/settings/user"].includes(path)) return Response.json({ saved: true });
      if (url.hostname === "files.oaiusercontent.com") return new Response(binary);
      throw new Error(`Unexpected request: ${url}`);
    } },
  };
  const write = async (path, value) => {
    await overrides.write?.(path, value);
    writes.set(path, value);
  };
  const download = (url = origin) => chatgptService.download(runtime, url, parseSourceUrl(url, catalog), write);
  const manifest = (base = "chatgpt") => JSON.parse(writes.get(`${base}/manifest.json`));
  return { runtime, calls, writes, binary, write, download, manifest };
}

test("ChatGPT recognizes roots, projects and project conversation URLs without matching unrelated pages", () => {
  for (const host of ["chatgpt.com", "chat.openai.com"]) {
    assert.equal(parseSourceUrl(`https://${host}/?foo=bar`, catalog).identifier, "history");
    assert.equal(parseSourceUrl(`https://${host}/g/${projectId}/project/`, catalog).identifier, projectId);
    assert.equal(parseSourceUrl(`https://${host}/g/${projectId}/c/chat/`, catalog).identifier, "chat");
  }
  for (const url of ["https://example.com/", `${origin}/projects`, `${origin}/g/assistant`, `${origin}/c/chat/other`]) assert.throws(() => parseSourceUrl(url, catalog));
});

test("root download saves ordinary and project chats, full branches, raw metadata and project instructions", async () => {
  const state = fixture();
  const result = await state.download();
  assert.equal(result.path, "chatgpt/index.md");
  assert.equal(result.error, undefined);
  assert.equal(state.manifest().status, "complete");
  assert.equal(state.manifest().records.filter(record => record.type === "conversation").length, 2);
  const directory = "chatgpt/accounts/account/conversations/normal";
  assert.match(state.writes.get(`${directory}/conversation.json`), /Other branch/);
  assert.doesNotMatch(state.writes.get(`${directory}/index.md`), /Other branch/);
  assert.match(state.writes.get(`chatgpt/accounts/account/projects/${projectId}/index.md`), /Keep the entire project/);
  assert.equal(state.calls.filter(call => call.url.pathname === "/api/auth/session").length, 1);
  assert.equal(state.calls.filter(call => call.url.pathname === "/backend-api/conversation/project-chat").length, 1);
  assert.equal(state.calls.find(call => call.url.pathname.endsWith("/sidebar")).url.searchParams.get("owned_only"), "false");
  assert.equal(state.calls.find(call => call.url.pathname.endsWith(`${projectId}/conversations`)).url.searchParams.get("limit"), "50");
  assert.equal([...state.writes.values()].some(value => typeof value === "string" && value.includes('"accessToken"')), false);
});

test("pagination exhausts active, archived, project and shared-workspace listings without duplicates", async () => {
  const state = fixture({ request(url, options) {
    const account = options.headers["chatgpt-account-id"];
    if (url.pathname === "/backend-api/accounts/check/v4-2023-04-27") return Response.json({ accounts: {
      current: { account: { account_id: "account" } },
      shared: { account: { account_id: "shared" }, can_access_with_session: true },
      unavailable: { account: { account_id: "disabled", is_deactivated: true } },
    } });
    if (url.pathname === "/backend-api/conversations") {
      const offset = Number(url.searchParams.get("offset"));
      const archived = url.searchParams.get("is_archived") === "true";
      const total = archived ? 1 : 3;
      const entries = archived ? [{ id: `${account}-archived` }] : offset === 0 ? [{ id: `${account}-first` }, { id: `${account}-second` }] : [{ id: `${account}-third` }];
      return Response.json({ items: entries, total, offset, limit: 100 });
    }
    if (url.pathname === "/backend-api/gizmos/snorlax/sidebar") return Response.json({ items: url.searchParams.has("cursor") ? [{ gizmo: project("g-p-empty"), conversations: { items: [] } }] : [{ gizmo: project(), conversations: { items: [] } }], cursor: url.searchParams.has("cursor") ? null : "next project" });
    if (url.pathname === "/backend-api/gizmos/g-p-empty") return Response.json(project("g-p-empty"));
    if (url.pathname === "/backend-api/gizmos/g-p-empty/conversations" || url.pathname === "/backend-api/projects/g-p-empty/connector_scopes") return Response.json({ items: [], cursor: null });
    if (url.pathname === `/backend-api/gizmos/${projectId}/conversations`) return Response.json({ items: [{ id: url.searchParams.has("cursor") ? "project-later" : "project-chat" }], cursor: url.searchParams.has("cursor") ? null : "opaque&cursor" });
  } });
  await state.download();
  assert.deepEqual(state.manifest().errors, []);
  assert.equal(state.manifest().records.filter(record => record.type === "conversation").length, 12);
  assert.equal(state.manifest().records.filter(record => record.type === "project").length, 4);
  assert.equal(state.manifest().skipped.length, 1);
  assert.equal(state.calls.some(call => call.account === "disabled"), false);
  assert.equal(state.calls.some(call => call.url.searchParams.get("cursor") === "opaque&cursor"), true);
  assert.deepEqual([...new Set(state.calls.filter(call => call.url.pathname === "/backend-api/conversations").map(call => call.url.searchParams.get("is_starred")))].sort(), ["false", "true"]);
});

test("project download excludes unrelated chats but includes archived members and project-only chats", async () => {
  const state = fixture({ request(url) {
    if (url.pathname === "/backend-api/conversations" && url.searchParams.get("is_archived") === "true") return Response.json({ items: [{ id: "archived-project-chat", gizmo_id: projectId }, { id: "unrelated-archive" }], offset: 0, total: 2 });
    if (url.pathname === `/backend-api/gizmos/${projectId}/conversations`) return Response.json({ items: [{ id: "project-chat" }, { id: "shared-project-chat" }], cursor: null });
  } });
  const result = await state.download(projectUrl);
  const base = `chatgpt/projects/${projectId}`;
  assert.equal(result.path, `${base}/export.md`);
  assert.equal(state.manifest(base).records.filter(record => record.type === "conversation").length, 3);
  assert.equal(state.calls.some(call => call.url.pathname.endsWith("/conversation/normal")), false);
  assert.equal([...state.writes.values()].some(value => typeof value === "string" && value.includes("unrelated-archive")), false);
  assert.equal(state.calls.some(call => call.url.pathname.includes("/library/")), false);
});

test("downloads project files, all-branch attachments, sandbox output, canvases and nested Library files", async () => {
  const state = fixture({ request(url) {
    if (url.pathname === `/backend-api/gizmos/${projectId}`) return Response.json({ ...project(), files: [{ id: "file_project", name: "../../project.bin" }] });
    if (url.pathname === "/backend-api/conversation/normal") {
      const data = conversation("normal");
      data.mapping.alternative.message.metadata = { attachments: [{ id: "file-upload", name: "same.bin" }] };
      data.mapping.reply.message.content.parts.push("[result](sandbox:/mnt/data/output.bin)", { content_type: "image_asset_pointer", asset_pointer: "file-service://file-image#original?format=webp" });
      return Response.json(data);
    }
    if (url.pathname === "/backend-api/conversation/normal/textdocs") return Response.json([{ id: "canvas", title: "Work", content: "complete canvas", version: 4 }]);
    if (url.pathname === "/backend-api/files/library/nodes") return Response.json({ items: url.searchParams.has("parent_directory_id") ? [{ kind: "file", id: "libfile-child", name: "same.bin" }] : [{ kind: "directory", id: "folder" }, { kind: "file", id: "libfile-root", name: "same.bin" }], cursor: null });
    if (url.pathname.startsWith("/backend-api/files/download/") || url.pathname.endsWith("/content_url") || url.pathname.endsWith("/interpreter/download")) return Response.json({ download_url: "https://files.oaiusercontent.com/content", status: "success" });
  } });
  await state.download();
  assert.deepEqual(state.manifest().errors, []);
  assert.equal(state.manifest().files.length, 6);
  const imageRequest = state.calls.find(call => call.url.pathname.endsWith("/file-image*original"));
  assert.equal(imageRequest.url.searchParams.get("format"), "webp");
  assert.equal(imageRequest.url.searchParams.get("conversation_id"), "normal");
  assert.equal(state.writes.get("chatgpt/accounts/account/conversations/normal/canvases/canvas.txt"), "complete canvas");
  for (const file of state.manifest().files) {
    assert.deepEqual(state.writes.get(file.path), state.binary);
    assert.equal(file.sha256, createHash("sha256").update(state.binary).digest("hex"));
    assert.equal(file.path.split("/").includes(".."), false);
  }
  for (const call of state.calls.filter(call => call.url.hostname === "files.oaiusercontent.com")) assert.deepEqual(call.options.headers, {});
});

test("individual failures retain other data, and repeated pagination is reported as partial", async () => {
  const state = fixture({ request(url) {
    if (url.pathname === "/backend-api/conversation/normal") return new Response("gone", { status: 404 });
    if (url.pathname === `/backend-api/gizmos/${projectId}/conversations`) return Response.json({ items: [{ id: "project-chat" }], cursor: "repeated" });
  } });
  const result = await state.download();
  assert.match(result.error, /2 downloads failed/);
  assert.equal(state.manifest().status, "partial");
  assert.equal(state.manifest().records.filter(record => record.type === "conversation").length, 1);
  assert.equal(state.calls.filter(call => call.url.pathname.endsWith(`${projectId}/conversations`)).length, 2);
});

test("retries throttled requests without restarting completed downloads", async () => {
  let tries = 0;
  const state = fixture({ request(url) {
    if (url.pathname === "/backend-api/conversation/normal" && tries++ === 0) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
  } });
  const result = await state.download();
  assert.equal(result.error, undefined);
  assert.equal(tries, 2);
  assert.equal(state.calls.filter(call => call.url.pathname.endsWith("/conversation/project-chat")).length, 1);
  assert.equal(state.manifest().cooldowns.length, 1);
  assert.equal(state.manifest().cooldowns[0].source, "retry-after-seconds");
});

test("persistent cooldown preserves completed files and produces a partial manifest with an exact retry time", async () => {
  const state = fixture({ request(url) {
    if (url.pathname === "/backend-api/conversation/project-chat") return new Response(null, { status: 429, headers: { "retry-after": "0" } });
  } });
  const result = await state.download();
  assert.match(result.error, /1 downloads failed/);
  assert.equal(state.manifest().status, "partial");
  assert.equal(state.manifest().cooldowns.length, 5);
  assert.equal(typeof state.manifest().errors[0].retry_at, "string");
  assert.ok(result.error.includes(state.manifest().errors[0].retry_at));
  assert.equal(state.writes.has("chatgpt/accounts/account/conversations/normal/conversation.json"), true);
  assert.equal(state.calls.some(call => call.url.pathname === "/backend-api/files/library/nodes"), false);
});

test("file redirects cannot leak credentials or download from untrusted hosts", async () => {
  const state = fixture({ request(url) {
    if (url.pathname === `/backend-api/gizmos/${projectId}`) return Response.json({ ...project(), files: [{ id: "file-private", name: "private" }] });
    if (url.pathname.startsWith("/backend-api/files/download/")) return Response.json({ download_url: "https://chatgpt.com/backend-api/estuary/content?id=1" });
    if (url.pathname === "/backend-api/estuary/content") return new Response(null, { status: 302, headers: { location: "https://attacker.example/collect" } });
  } });
  const result = await state.download();
  assert.match(result.error, /1 downloads failed/);
  assert.match(state.manifest().errors[0].error, /Untrusted/);
  assert.equal(state.calls.some(call => call.url.hostname === "attacker.example"), false);
});

test("disk failures stop exporting and leave an in-progress manifest rather than claiming success", async () => {
  const state = fixture({ write(path) { if (path.endsWith("/conversation.json")) throw new Error("disk full"); } });
  await assert.rejects(state.download(), /disk full/);
  assert.equal(state.manifest().status, "in_progress");
});

function memoryWire(service, state) {
  return composeWire({
    home: "/home/test", fetchInput: state.runtime, catalog: defineServiceCatalog([service]),
    filesystem: { exists: async path => state.writes.has(path), isFile: async () => true, readText: async path => state.writes.get(path), writeText: state.write, writeBytes: state.write },
    workspace: { configuredRoot: async () => { throw new Error("One-off exports must not initialize tracking"); } },
    initialization: { backend: "files", registryPath: "resources" }, now: () => new Date("2026-09-01T17:00:00Z"),
  });
}

test("Wire SDK writes the collection beneath the requested directory without registration", async () => {
  const state = fixture();
  const wire = memoryWire(chatgptService, state);
  const result = await wire.downloadSource(origin, "/downloads");
  assert.equal(result.path, "/downloads/chatgpt/index.md");
  assert.equal(result.summary.action, "downloaded");
  assert.equal(state.writes.has("/downloads/chatgpt/accounts/account/conversations/normal/conversation.json"), true);
  assert.equal(state.writes.get(result.path), result.markdown);
});

test("Wire rejects collection path escapes, including unsafe final index paths", async () => {
  for (const path of ["../escape", "/absolute", "..\\escape"]) {
    const state = fixture();
    const service = { ...chatgptService, download: async (_runtime, _url, _source, write) => { await write(path, "bad"); return null; } };
    await assert.rejects(memoryWire(service, state).downloadSource(origin, "/downloads"), /Unsafe download path/);
    assert.equal(state.writes.size, 0);
    service.download = async () => ({ path, title: "bad", markdown: "bad", data: {} });
    await assert.rejects(memoryWire(service, state).downloadSource(origin, "/downloads"), /Unsafe download path/);
  }
});
