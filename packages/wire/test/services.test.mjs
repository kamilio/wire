import assert from "node:assert/strict";
import test from "node:test";
import { createCookiesCapability, fetchSource, markdownFilename, parseSourceUrl, synchronizeSource } from "../dist/index.js";
import { serviceCatalog } from "../dist/index.js";

function response(value, text, init = {}) {
  return new Response(text ?? JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...init.headers } });
}

function exportResponse(title, extension, text) {
  return new Response(text, { headers: { "content-disposition": `attachment; filename="${title}.${extension}"` } });
}

function exportResponseWithDisposition(disposition, text) {
  return new Response(text, { headers: { "content-disposition": disposition } });
}

function zip(entries) {
  const files = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    files.push(local, nameBytes, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 10);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...files, ...central, end]);
}

function pptxResponse(title, entries) {
  return new Response(zip(entries), { headers: { "content-disposition": `attachment; filename="${title}.pptx"` } });
}

function pptxEntries(slides, rels = {}) {
  const entries = {
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slides.map((_slide, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_slide, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}</Relationships>`,
  };
  for (const [index, slide] of slides.entries()) {
    entries[`ppt/slides/slide${index + 1}.xml`] = slide;
    entries[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(rels[index + 1] ?? {}).map(([id, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${target}" TargetMode="External"/>`).join("")}</Relationships>`;
  }
  return entries;
}

function testCookie(name, value, domain) {
  return { domain, includeSubdomains: domain.startsWith("."), path: "/", secure: true, expires: 0, name, value, httpOnly: true };
}

function sheetHtml(revision = 7, sid = "sid-1", gridId = 7) {
  return new Response(`<script>_docs_flag_initialData={"info_params":{"token":"token-1"}}</script><script>var bootstrapData = ${JSON.stringify({ gridId, changes: { revision, sid } })}; function loadWaffle() {}</script>`);
}

function docsHtml(text, revision = 7) {
  return new Response(`<script>_docs_flag_initialData={"info_params":{"token":"token-1","ouid":"user-1","includes_info_params":true}}</script><script>DOCS_warmStartDocumentLoader.startLoad( ${revision}.0 ,'version-1', 2147483647 , 0.0 ,[2147483647,"AAE="], 1781652343780 , null ); var DOCS_modelChunkLoadStart; var DOCS_modelChunkParseStart; var DOCS_modelChunk;</script><script>DOCS_modelChunk = ${JSON.stringify({ chunk: [{ ty: "is", ibi: 1, s: text }], revision })}; DOCS_modelChunkLoadStart = new Date().getTime();</script>`);
}

function sheetBundleCells(body) {
  const bundles = JSON.parse(new URLSearchParams(body).get("bundles"));
  return bundles[0].commands.map((command) => {
    const payload = JSON.parse(command[1]);
    return { row: payload[0][1], column: payload[0][3], value: payload[1][2][1] };
  });
}

function runtime(handler) {
  return Object.freeze({
    http: Object.freeze({ request: handler }),
    filesystem: Object.freeze({ exists: async () => true, readText: async () => "", writeText: async () => {}, delete: async () => {} }),
    process: Object.freeze({ execute: async () => ({ stdout: "", stderr: "" }) }),
    clock: Object.freeze({ now: () => new Date("2026-06-10T12:00:00.000Z"), localTimezone: () => "UTC", timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) }),
    openFiles: Object.freeze({ open: async () => {} }),
    configuration: Object.freeze({ get: (name) => ({ GOOGLE_CALENDAR_TIMEZONE: "UTC" })[name] }),
    secrets: Object.freeze({ get: async (reference) => ({
      "op://Agents/Slack/token": "slack-token",
      "op://Agents/Slack/workspace_origin": "https://quora.slack.com",
    })[reference] }),
    cookies: Object.freeze({ load: async (service) => service === "asana" ? [{ name: "ticket", value: "session" }] : service === "zoom" ? [testCookie("zm_aid", "account", ".zoom.us"), testCookie("_zm_ssid", "session", ".zoom.us")] : service === "chatgpt" ? [{ name: "oai-did", value: "device" }, { name: "__Secure-next-auth.session-token", value: "session" }] : service === "google-docs" ? [{ name: "SID", value: "google-session" }] : [{ name: "notion_user_id", value: "user" }], loadSaved: async (service) => service === "asana" ? [{ name: "ticket", value: "session" }] : service === "zoom" ? [testCookie("zm_aid", "account", ".zoom.us"), testCookie("_zm_ssid", "session", ".zoom.us")] : service === "chatgpt" ? [{ name: "oai-did", value: "device" }, { name: "__Secure-next-auth.session-token", value: "session" }] : service === "google-docs" ? [{ name: "SID", value: "google-session" }] : [{ name: "notion_user_id", value: "user" }], metadata: async () => Object.freeze({ token: "xoxc-token" }), save: async () => {}, delete: async () => {} }),
    gmailTokens: Object.freeze({ load: async () => ({ token: "google-token", refresh_token: "refresh", token_uri: "token-uri" }), refresh: async () => ({ token: "google-token", refresh_token: "refresh", token_uri: "token-uri" }) }),
    googleFormsTokens: Object.freeze({ load: async () => ({ token: "forms-token", refresh_token: "refresh", token_uri: "token-uri" }), refresh: async () => ({ token: "forms-token", refresh_token: "refresh", token_uri: "token-uri" }) }),
  });
}

test("asana task adapter renders task and paginated activity", async () => {
  const requests = [];
  const headers = [];
  const document = await fetchSource(runtime(async (input, init) => {
    requests.push(String(input));
    headers.push(init.headers);
    if (String(input).includes("/stories")) return response(requests.length === 2 ? { data: [{ created_at: "2026-06-10", created_by: { name: "Kamil" }, text: "Updated" }], next_page: { offset: "next" } } : { data: [], next_page: null });
    return response({ data: { name: "Task", permalink_url: "https://app.asana.com/task", completed: false, assignee: { name: "Kamil" }, notes: "Notes" } });
  }), "https://app.asana.com/0/1/2/f", serviceCatalog);
  assert.equal(document.title, "Task");
  assert.equal(document.markdown, "# Task\n\n- Source: https://app.asana.com/task\n- Completed: False\n- Assignee: Kamil\n\nNotes\n\n## Activity\n\n- 2026-06-10 — Kamil: Updated\n");
  assert.equal(requests.length, 3);
  assert.equal(headers[0].Cookie, "ticket=session");
  assert.equal("Authorization" in headers[0], false);
});

test("asana task adapter renders activity without an actor", async () => {
  const document = await fetchSource(runtime(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/stories")) return response({ data: [{ created_at: "2026-06-10", created_by: null, text: "System update" }], next_page: null });
    return response({ data: { name: "Task", permalink_url: "https://app.asana.com/task", completed: false, assignee: null, notes: "Notes" } });
  }), "https://app.asana.com/0/1/2/f", serviceCatalog);
  assert.equal(document.markdown, "# Task\n\n- Source: https://app.asana.com/task\n- Completed: False\n\nNotes\n\n## Activity\n\n- 2026-06-10 — System: System update\n");
});

test("asana task adapter reports API errors before reading task fields", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response(JSON.stringify({ errors: [{ message: "Not found" }] }), { status: 404, headers: { "content-type": "application/json" } })), "https://app.asana.com/0/1/2/f", serviceCatalog),
    /Asana API \/tasks\/2 failed: HTTP 404 Not found/,
  );
});

test("asana task adapter reports expired cookie authentication with login command", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response(JSON.stringify({ errors: [{ message: "Not authorized" }] }), { status: 401, headers: { "content-type": "application/json" } })), "https://app.asana.com/0/1/2/f", serviceCatalog),
    /Asana authentication is missing or expired\. Run `wire asana login` once; other commands reuse saved cookies\./,
  );
});

test("modern Asana list URLs resolve to the project", () => {
  assert.deepEqual(parseSourceUrl("https://app.asana.com/1/311773678927/project/1213253233295838/list/1213253233295868", serviceCatalog), { service: "asana-project", identifier: "1213253233295838", type: "project" });
  assert.deepEqual(parseSourceUrl("https://app.asana.com/1/311773678927/project/1213253233295838/board", serviceCatalog), { service: "asana-project", identifier: "1213253233295838", type: "project" });
  assert.deepEqual(parseSourceUrl("https://app.asana.com/1/311773678927/project/1213253233295838/calendar/1213253233295868", serviceCatalog), { service: "asana-project", identifier: "1213253233295838", type: "project" });
  assert.deepEqual(parseSourceUrl("https://app.asana.com/0/1213253233295838/timeline/1213253233295868", serviceCatalog), { service: "asana-project", identifier: "1213253233295838", type: "project" });
});

test("modern Asana task URLs resolve to the task", () => {
  assert.deepEqual(parseSourceUrl("https://app.asana.com/1/311773678927/project/1213253233295838/task/12058909747493732", serviceCatalog), { service: "asana-task", identifier: "12058909747493732", type: "task" });
  assert.deepEqual(parseSourceUrl("https://app.asana.com/1/545454564564/task/1206091418751648", serviceCatalog), { service: "asana-task", identifier: "1206091418751648", type: "task" });
});

test("malformed Asana list URLs are rejected", () => {
  for (const url of ["https://app.asana.com/project/123/list", "https://app.asana.com/1/311773678927/list/1213253233295838/project/1213253233295868", "https://app.asana.com/0/123/extra/list"]) assert.throws(() => parseSourceUrl(url, serviceCatalog));
});

test("ChatGPT conversation URLs resolve to message threads", () => {
  assert.deepEqual(parseSourceUrl("https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog), { service: "chatgpt", identifier: "123e4567-e89b-12d3-a456-426614174000", type: "message-thread" });
  assert.deepEqual(parseSourceUrl("https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000/", serviceCatalog), { service: "chatgpt", identifier: "123e4567-e89b-12d3-a456-426614174000", type: "message-thread" });
  assert.deepEqual(parseSourceUrl("https://chat.openai.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog), { service: "chatgpt", identifier: "123e4567-e89b-12d3-a456-426614174000", type: "message-thread" });
});

function asanaServer() {
  const state = {
    project: { gid: "100", name: "Launch", permalink_url: "https://app.asana.com/0/100/list" },
    sections: [{ gid: "200", name: "Product" }],
    tasks: [
      { gid: "300", name: "Beta", completed: false, parent: null, resource_subtype: "milestone", permalink_url: "https://app.asana.com/0/100/task/300", memberships: [{ project: { gid: "100" }, section: { gid: "200" } }] },
      { gid: "400", name: "Ship API", completed: false, parent: null, resource_subtype: "default_task", permalink_url: "https://app.asana.com/0/100/task/400", memberships: [{ project: { gid: "100" }, section: { gid: "200" } }] },
    ],
    subtasks: { "400": [{ gid: "500", name: "Document API", completed: false, parent: { gid: "400" }, resource_subtype: "default_task", permalink_url: "https://app.asana.com/0/100/task/500" }] },
    writes: [],
    next: 600,
  };
  const findTask = (gid) => state.tasks.find((task) => task.gid === gid) ?? Object.values(state.subtasks).flat().find((task) => task.gid === gid);
  const handler = async (input, init = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/1.0", "");
    const method = init.method ?? "GET";
    const data = init.body === undefined ? undefined : JSON.parse(init.body).data;
    if (method !== "GET") state.writes.push({ method, path, data });
    if (method === "GET" && path === "/projects/100") return response({ data: state.project });
    if (method === "GET" && path === "/projects/100/sections") return response({ data: state.sections, next_page: null });
    if (method === "GET" && path === "/projects/100/tasks") return response({ data: state.tasks, next_page: null });
    if (method === "GET" && path.startsWith("/tasks/") && path.endsWith("/subtasks")) return response({ data: state.subtasks[path.split("/")[2]] ?? [], next_page: null });
    if (method === "POST" && path === "/tasks") {
      const task = { gid: String(state.next++), name: data.name, completed: data.completed, parent: null, resource_subtype: data.resource_subtype ?? "default_task", permalink_url: `https://app.asana.com/0/100/task/${state.next - 1}`, memberships: [{ project: { gid: "100" }, section: { gid: state.sections[0].gid } }] };
      state.tasks.push(task);
      return response({ data: task });
    }
    if (method === "POST" && path === "/projects/100/sections") {
      const section = { gid: String(state.next++), name: data.name };
      state.sections.push(section);
      return response({ data: section });
    }
    if (method === "POST" && path.match(/^\/tasks\/\d+\/subtasks$/)) {
      const parent = path.split("/")[2];
      const task = { gid: String(state.next++), name: data.name, completed: data.completed, parent: { gid: parent }, resource_subtype: "default_task", permalink_url: `https://app.asana.com/0/100/task/${state.next - 1}` };
      state.subtasks[parent] ??= [];
      state.subtasks[parent].push(task);
      return response({ data: task });
    }
    if (method === "PUT" && path === "/projects/100") { Object.assign(state.project, data); return response({ data: state.project }); }
    if (method === "PUT" && path.startsWith("/sections/")) { Object.assign(state.sections.find((section) => section.gid === path.split("/")[2]), data); return response({ data: {} }); }
    if (method === "PUT" && path.startsWith("/tasks/")) { Object.assign(findTask(path.split("/")[2]), data); return response({ data: {} }); }
    if (method === "POST" && path === "/projects/100/sections/insert") {
      const section = state.sections.find((value) => value.gid === data.section);
      state.sections = state.sections.filter((value) => value !== section);
      const anchor = data.after_section ?? data.before_section;
      const index = state.sections.findIndex((value) => value.gid === anchor) + (data.after_section === undefined ? 0 : 1);
      state.sections.splice(index, 0, section);
      return response({ data: {} });
    }
    if (method === "POST" && path.endsWith("/addProject")) {
      const task = findTask(path.split("/")[2]);
      if (data.section !== undefined) task.memberships = [{ project: { gid: "100" }, section: { gid: data.section } }];
      state.tasks = state.tasks.filter((value) => value !== task);
      const anchor = data.insert_after ?? data.insert_before;
      const index = anchor === undefined ? state.tasks.length : state.tasks.findIndex((value) => value.gid === anchor) + (data.insert_after === undefined ? 0 : 1);
      state.tasks.splice(index, 0, task);
      return response({ data: {} });
    }
    if (method === "POST" && path.match(/^\/sections\/\d+\/addTask$/)) {
      const section = path.split("/")[2];
      const task = findTask(data.task);
      task.memberships = [{ project: { gid: "100" }, section: { gid: section } }];
      state.tasks = state.tasks.filter((value) => value !== task);
      const anchor = data.insert_after ?? data.insert_before;
      const index = anchor === undefined ? state.tasks.length : state.tasks.findIndex((value) => value.gid === anchor) + (data.insert_after === undefined ? 0 : 1);
      state.tasks.splice(index, 0, task);
      return response({ data: {} });
    }
    if (method === "POST" && path.endsWith("/setParent")) {
      const gid = path.split("/")[2];
      const task = findTask(gid);
      for (const values of Object.values(state.subtasks)) values.splice(0, values.length, ...values.filter((value) => value.gid !== gid));
      task.parent = { gid: data.parent };
      state.subtasks[data.parent] ??= [];
      state.subtasks[data.parent].push(task);
      return response({ data: {} });
    }
    if (method === "DELETE" && path.startsWith("/sections/")) {
      state.sections = state.sections.filter((section) => section.gid !== path.split("/")[2]);
      return response({ data: {} });
    }
    if (method === "DELETE" && path.startsWith("/tasks/")) {
      const gid = path.split("/")[2];
      state.tasks = state.tasks.filter((task) => task.gid !== gid);
      for (const values of Object.values(state.subtasks)) values.splice(0, values.length, ...values.filter((task) => task.gid !== gid));
      return response({ data: {} });
    }
    throw new Error(`${method} ${path}`);
  };
  return { state, handler };
}

test("asana project adapter renders project, section, milestone, task, and subtask hierarchy", async () => {
  const server = asanaServer();
  const document = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  assert.equal(document.markdown, "# [Launch](https://app.asana.com/0/100/list)\n\n## Product <!-- asana-section:200 -->\n\n### [Beta](https://app.asana.com/0/100/task/300)\n\n- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n");
  assert.equal(server.state.writes.length, 0);
});

test("asana synchronization pushes local edits and rewrites canonical URLs", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const local = base.markdown
    .replace("[Ship API]", "[Ship public API]")
    .replace("- [ ] [Ship public API]", "- [x] [Ship public API]")
    .replace("  - [ ] [Document API](https://app.asana.com/0/100/task/500)", "  - [x] [Document API](https://app.asana.com/0/100/task/500)\n  - [ ] Add examples");
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  assert.match(synchronized.markdown, /\[Ship public API\]\(https:\/\/app\.asana\.com\/0\/100\/task\/400\)/);
  assert.match(synchronized.markdown, /\[Add examples\]\(https:\/\/app\.asana\.com\/0\/100\/task\/600\)/);
  assert.deepEqual(server.state.writes.slice(0, 3), [
    { method: "POST", path: "/tasks/400/subtasks", data: { name: "Add examples", completed: false } },
    { method: "PUT", path: "/tasks/400", data: { name: "Ship public API" } },
    { method: "PUT", path: "/tasks/400", data: { completed: true } },
  ]);
  assert.ok(server.state.writes.some((write) => write.method === "PUT" && write.path === "/tasks/500" && write.data.completed === true));
});

test("asana synchronization merges remote-only changes with local-only changes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  server.state.tasks.find((task) => task.gid === "400").completed = true;
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, base.markdown.replace("[Ship API]", "[Ship public API]"));
  assert.match(synchronized.markdown, /- \[x\] \[Ship public API\]/);
  assert.deepEqual(server.state.writes, [{ method: "PUT", path: "/tasks/400", data: { name: "Ship public API" } }]);
});

test("asana synchronization rejects conflicting field edits without writes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  server.state.tasks.find((task) => task.gid === "400").name = "Remote API";
  await assert.rejects(() => synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, base.markdown.replace("[Ship API]", "[Local API]")), /Conflicting Asana edits: task:400.name/);
  assert.deepEqual(server.state.writes, []);
});

test("asana synchronization rejects local edits after remote deletion without writes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  server.state.tasks = server.state.tasks.filter((task) => task.gid !== "400");
  await assert.rejects(() => synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, base.markdown.replace("[Ship API]", "[Local API]")), /Conflicting Asana edits: task:400/);
  assert.deepEqual(server.state.writes, []);
});

test("asana synchronization creates sections and moves tasks", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const task = "- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n";
  const local = base.markdown.replace(task, "").trimEnd() + `\n\n## Engineering\n\n${task}`;
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  assert.match(synchronized.markdown, /## Engineering <!-- asana-section:600 -->/);
  assert.match(synchronized.markdown, /## Engineering[^]*\[Ship API\]/);
  assert.ok(server.state.writes.some((write) => write.path === "/projects/100/sections" && write.data.name === "Engineering"));
  assert.ok(server.state.writes.some((write) => write.path === "/sections/600/addTask" && write.data.task === "400"));
});

test("asana synchronization attaches fresh milestones and tasks to their declared section in order", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const local = `${base.markdown.trimEnd()}\n\n## Engineering\n\n### Release gate\n\n- [ ] Ship worker\n`;
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  const section = server.state.sections.find((value) => value.name === "Engineering");
  const milestone = server.state.tasks.find((value) => value.name === "Release gate");
  const task = server.state.tasks.find((value) => value.name === "Ship worker");
  assert.equal(milestone.memberships[0].section.gid, section.gid);
  assert.equal(task.memberships[0].section.gid, section.gid);
  assert.ok(server.state.tasks.indexOf(milestone) < server.state.tasks.indexOf(task));
  assert.match(synchronized.markdown, /## Engineering[^]*### \[Release gate\][^]*- \[ \] \[Ship worker\]/);
});

test("asana synchronization reorders sections", async () => {
  const server = asanaServer();
  server.state.sections.push({ gid: "201", name: "Marketing" });
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const product = "## Product <!-- asana-section:200 -->\n\n### [Beta](https://app.asana.com/0/100/task/300)\n\n- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n\n";
  const marketing = "## Marketing <!-- asana-section:201 -->\n";
  const local = base.markdown.replace(`${product}${marketing}`, `${marketing}\n${product.trimEnd()}\n`);
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  assert.ok(synchronized.markdown.indexOf("Marketing") < synchronized.markdown.indexOf("Product"));
  assert.ok(server.state.writes.some((write) => write.path === "/projects/100/sections/insert"));
});

test("asana synchronization reorders top-level tasks", async () => {
  const server = asanaServer();
  server.state.tasks.push({ gid: "401", name: "Ship UI", completed: false, parent: null, resource_subtype: "default_task", permalink_url: "https://app.asana.com/0/100/task/401", memberships: [{ project: { gid: "100" }, section: { gid: "200" } }] });
  server.state.subtasks["401"] = [];
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const first = "- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n";
  const second = "- [ ] [Ship UI](https://app.asana.com/0/100/task/401)\n";
  const local = base.markdown.replace(`${first}${second}`, `${second}${first}`);
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  assert.ok(synchronized.markdown.indexOf("Ship UI") < synchronized.markdown.indexOf("Ship API"));
  assert.ok(server.state.writes.some((write) => write.path === "/sections/200/addTask" && write.data.task === "401"));
});

test("asana synchronization reparents subtasks", async () => {
  const server = asanaServer();
  server.state.tasks.push({ gid: "401", name: "Ship UI", completed: false, parent: null, resource_subtype: "default_task", permalink_url: "https://app.asana.com/0/100/task/401", memberships: [{ project: { gid: "100" }, section: { gid: "200" } }] });
  server.state.subtasks["401"] = [];
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const child = "  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n";
  const local = base.markdown.replace(child, "").replace("- [ ] [Ship UI](https://app.asana.com/0/100/task/401)\n", `- [ ] [Ship UI](https://app.asana.com/0/100/task/401)\n${child}`);
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local);
  assert.match(synchronized.markdown, /\[Ship UI\][^]*  - \[ \] \[Document API\]/);
  assert.ok(server.state.writes.some((write) => write.path === "/tasks/500/setParent" && write.data.parent === "401"));
});

test("asana synchronization rejects removed tasks and subtasks without writes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const local = base.markdown.replace("- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n  - [ ] [Document API](https://app.asana.com/0/100/task/500)\n", "");
  await assert.rejects(() => synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local), /Asana task removal is not supported from project Markdown: Ship API, Document API/);
  assert.deepEqual(server.state.writes, []);
});

test("asana synchronization rejects removed unsectioned tasks without writes", async () => {
  const server = asanaServer();
  server.state.sections = [];
  server.state.tasks = [{ gid: "400", name: "Loose task", completed: false, parent: null, resource_subtype: "default_task", permalink_url: "https://app.asana.com/0/100/task/400", memberships: [{ project: { gid: "100" }, section: null }] }];
  server.state.subtasks = { "400": [] };
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  assert.match(base.markdown, /## No section <!-- asana-section:__unsectioned__ -->/);
  const local = base.markdown.replace("## No section <!-- asana-section:__unsectioned__ -->\n\n- [ ] [Loose task](https://app.asana.com/0/100/task/400)\n", "");
  await assert.rejects(() => synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local), /Asana task removal is not supported from project Markdown: Loose task/);
  assert.deepEqual(server.state.writes, []);
});

test("asana synchronization accepts identical local and remote edits without writes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  server.state.tasks.find((task) => task.gid === "400").name = "Shared API";
  const synchronized = await synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, base.markdown.replace("[Ship API]", "[Shared API]"));
  assert.match(synchronized.markdown, /Shared API/);
  assert.deepEqual(server.state.writes, []);
});

test("asana synchronization rejects unknown linked identities without writes", async () => {
  const server = asanaServer();
  const base = await fetchSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog);
  const local = base.markdown.replace(/\n$/, "\n- [ ] [Foreign](https://app.asana.com/0/999/task/999)\n");
  await assert.rejects(() => synchronizeSource(runtime(server.handler), "https://app.asana.com/0/100/list", serviceCatalog, base.data, local), /Unknown Asana identity 999/);
  assert.deepEqual(server.state.writes, []);
});

test("gmail adapter traverses MIME and converts HTML", async () => {
  const plain = Buffer.from("Plain").toString("base64url");
  const html = Buffer.from("<p>Hello <b>world</b></p><div>Next</div>").toString("base64url");
  const document = await fetchSource(runtime(async () => response({ messages: [
    { id: "1", payload: { headers: [{ name: "From", value: "A" }, { name: "To", value: "B" }, { name: "Date", value: "Today" }, { name: "Subject", value: "Subject" }], mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: plain } }, { mimeType: "text/html", body: { data: html } }] } },
    { id: "2", payload: { headers: [{ name: "From", value: "B" }, { name: "To", value: "A" }, { name: "Date", value: "Later" }, { name: "Subject", value: "Subject" }], mimeType: "text/html", body: { data: html } } },
  ] })), "https://mail.google.com/mail/u/0/#inbox/thread", serviceCatalog);
  assert.equal(document.markdown, "# Subject\n\n- Source: https://mail.google.com/mail/u/0/#inbox/thread\n- Thread ID: thread\n\n## A — Today\n\n**To:** B\n\nPlain\n\n## B — Later\n\n**To:** A\n\nHello world\nNext\n");
});

test("gmail adapter falls back from empty plain alternatives to linked HTML", async () => {
  const plain = Buffer.from("").toString("base64url");
  const html = Buffer.from('<p>Open <a href="https://example.com/reset">reset password</a></p>').toString("base64url");
  const document = await fetchSource(runtime(async () => response({ messages: [
    { id: "1", payload: { headers: [{ name: "From", value: "A" }, { name: "Date", value: "Today" }, { name: "Subject", value: "Subject" }], mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: plain } }, { mimeType: "text/html", body: { data: html } }] } },
  ] })), "https://mail.google.com/mail/u/0/#inbox/thread", serviceCatalog);
  assert.equal(document.markdown, "# Subject\n\n- Source: https://mail.google.com/mail/u/0/#inbox/thread\n- Thread ID: thread\n\n## A — Today\n\nOpen [reset password](https://example.com/reset)\n");
});

test("gmail adapter skips inline image MIME leaves", async () => {
  const html = Buffer.from("<p>Hello</p>").toString("base64url");
  const document = await fetchSource(runtime(async () => response({ messages: [
    { id: "1", payload: { headers: [{ name: "From", value: "A" }, { name: "To", value: "B" }, { name: "Date", value: "Today" }, { name: "Subject", value: "Subject" }], mimeType: "multipart/mixed", parts: [{ mimeType: "text/html", body: { data: html } }, { mimeType: "image/png", body: { attachmentId: "inline" } }] } },
  ] })), "https://mail.google.com/mail/u/0/#inbox/thread", serviceCatalog);
  assert.equal(document.markdown, "# Subject\n\n- Source: https://mail.google.com/mail/u/0/#inbox/thread\n- Thread ID: thread\n\n## A — Today\n\n**To:** B\n\nHello\n");
});

test("gmail adapter reports API errors before reading thread messages", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response(JSON.stringify({ error: { code: 404, message: "Requested entity was not found." } }), { status: 404, headers: { "content-type": "application/json" } })), "https://mail.google.com/mail/u/0/#inbox/thread", serviceCatalog),
    /Gmail API thread fetch failed: HTTP 404 Requested entity was not found\./,
  );
});

test("slack adapter resolves users, mentions, bots, and formatting", async () => {
  const document = await fetchSource(runtime(async (input, init) => {
    if (String(input) === "https://quora.slack.com/") return response(null, "<script>xoxc-session-token</script>");
    const body = new URLSearchParams(String(init.body));
    const method = String(input).split("/api/")[1];
    if (method === "conversations.replies") return response({ messages: [{ ts: "1781107577.334469", user: "U1", text: "Hi <@U2> <https://example.com|link>```code```" }, { ts: "1781107580.000000", bot_profile: { name: "Bot" }, text: "done" }] });
    if (method === "users.info") return response({ user: { name: body.get("user"), profile: { real_name: body.get("user") === "U1" ? "Alice" : "Bob" } } });
    throw new Error(method);
  }), "https://quora.slack.com/archives/C1/p1781107577334469", serviceCatalog);
  assert.equal(document.title, "2026-06-10-Hi_Bob_link_code");
  assert.equal(document.markdown, "## Alice — 2026-06-10 16:06\n\nHi @Bob [link](https://example.com)\n```\ncode\n```\n\n## Bot — 2026-06-10 16:06\n\ndone\n");
});

test("slack adapter uses saved workspace origin for app client message URLs", async () => {
  const requests = [];
  const base = runtime(async (input, init) => {
    const url = String(input);
    requests.push(url);
    const body = new URLSearchParams(String(init.body));
    assert.equal(body.get("channel"), "C1");
    assert.equal(body.get("ts"), "1781107577.334469");
    if (url === "https://quora.slack.com/api/conversations.replies") return response({ messages: [{ ts: "1781107577.334469", username: "bot", text: "Hi" }] });
    throw new Error(url);
  });
  const document = await fetchSource(Object.freeze({ ...base, cookies: Object.freeze({ ...base.cookies, metadata: async () => Object.freeze({ origin: "https://quora.slack.com", token: "xoxc-token" }) }) }), "https://app.slack.com/client/T1/C1/p1781107577334469", serviceCatalog);
  assert.deepEqual(requests, ["https://quora.slack.com/api/conversations.replies"]);
  assert.equal(document.markdown, "## bot — 2026-06-10 16:06\n\nHi\n");
});

test("slack adapter resolves users without profiles", async () => {
  const document = await fetchSource(runtime(async (input, init) => {
    const body = new URLSearchParams(String(init.body));
    const method = String(input).split("/api/")[1];
    if (method === "conversations.replies") return response({ messages: [{ ts: "1781107577.334469", user: "U1", text: "Hi <@U2>" }] });
    if (method === "users.info") return response({ user: { name: body.get("user") } });
    throw new Error(method);
  }), "https://quora.slack.com/archives/C1/p1781107577334469", serviceCatalog);
  assert.equal(document.markdown, "## U1 — 2026-06-10 16:06\n\nHi @U2\n");
});

test("slack adapter renders file-only messages with file metadata", async () => {
  const document = await fetchSource(runtime(async (input, init) => {
    const method = String(input).split("/api/")[1];
    if (method === "conversations.replies") return response({ messages: [{ ts: "1781107577.334469", user: "U1", text: "", files: [{ name: "spec.pdf", url_private: "https://files.slack.com/spec.pdf" }] }] });
    if (method === "users.info") return response({ user: { name: "kamil", profile: { real_name: "Kamil" } } });
    throw new Error(method);
  }), "https://quora.slack.com/archives/C1/p1781107577334469", serviceCatalog);
  assert.equal(document.markdown, "## Kamil — 2026-06-10 16:06\n\n- [spec.pdf](https://files.slack.com/spec.pdf)\n");
  assert.deepEqual(document.data.messages[0].files, [{ name: "spec.pdf", url: "https://files.slack.com/spec.pdf" }]);
});

test("slack adapter escapes link labels with brackets", async () => {
  const document = await fetchSource(runtime(async (input, init) => {
    const method = String(input).split("/api/")[1];
    if (method === "conversations.replies") return response({ messages: [{ ts: "1781107577.334469", user: "U1", text: "See <https://example.com|spec [draft]>" }] });
    if (method === "users.info") return response({ user: { name: "kamil", profile: { real_name: "Kamil" } } });
    throw new Error(method);
  }), "https://quora.slack.com/archives/C1/p1781107577334469", serviceCatalog);
  assert.equal(document.markdown, "## Kamil — 2026-06-10 16:06\n\nSee [spec \\[draft\\]](https://example.com)\n");
});

test("slack adapter reports Web API errors before reading messages", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => response({ ok: false, error: "not_authed" })), "https://quora.slack.com/archives/C1/p1781107577334469", serviceCatalog),
    /Slack API conversations\.replies failed: not_authed/,
  );
});

test("chatgpt adapter authenticates with cookies and renders conversation markdown", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, headers: init.headers });
    if (url === "https://chatgpt.com/api/auth/session") return response({ accessToken: "token", account: { id: "account" } });
    if (url === "https://chatgpt.com/backend-api/conversation/123e4567-e89b-12d3-a456-426614174000") return response({
      conversation_id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Wire ChatGPT",
      update_time: "2026-06-10T12:00:00+00:00",
      mapping: {
        root: { message: null },
        user: { message: { id: "1", create_time: 1781092800, author: { role: "user" }, content: { content_type: "text", parts: ["Hello"] } } },
        prelude: { message: { id: "2", create_time: 1781092810, author: { role: "assistant" }, content: { content_type: "text", parts: ["I’ll check the repository."] } } },
        thinking: { message: { id: "3", create_time: 1781092820, author: { role: "assistant" }, content: { content_type: "text", parts: ['{"content_type":"thoughts","thoughts":[],"source_analysis_msg_id":"hidden"}'] } } },
        assistant: { message: { id: "4", create_time: 1781092860, author: { role: "assistant" }, content: { content_type: "text", parts: ["Hi there citeturn1search0"] } } },
        recap: { message: { id: "5", create_time: 1781092870, author: { role: "assistant" }, content: { content_type: "reasoning_recap", content: "Thought for 4s" } } },
      },
    });
    throw new Error(url);
  }), "https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog);
  assert.equal(document.title, "Wire ChatGPT");
  assert.equal(document.markdown, "# Wire ChatGPT\n\n[Open in ChatGPT](https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000)\n\n## You\n\nHello\n\n## ChatGPT\n\nI’ll check the repository.\n\nHi there\n");
  assert.deepEqual(document.data, { conversation_id: "123e4567-e89b-12d3-a456-426614174000", update_time: "2026-06-10T12:00:00+00:00" });
  assert.equal(requests[0].headers["oai-device-id"], "device");
  assert.equal(requests[1].headers.authorization, "Bearer token");
  assert.equal(requests[1].headers["chatgpt-account-id"], "account");
});

test("chatgpt adapter exports JSON-looking user text literally", async () => {
  const document = await fetchSource(runtime(async (input) => {
    const url = String(input);
    if (url === "https://chatgpt.com/api/auth/session") return response({ accessToken: "token", account: { id: "account" } });
    if (url === "https://chatgpt.com/backend-api/conversation/json-text") return response({
      conversation_id: "json-text",
      title: "JSON text",
      update_time: 1781092800,
      mapping: {
        user: { message: { id: "1", create_time: 1781092800, author: { role: "user" }, content: { content_type: "text", parts: ['{"content_type": not valid json'] } } },
        assistant: { message: { id: "2", create_time: 1781092860, author: { role: "assistant" }, content: { content_type: "text", parts: ["Done"] } } },
      },
    });
    throw new Error(url);
  }), "https://chatgpt.com/c/json-text", serviceCatalog);
  assert.equal(document.markdown, "# JSON text\n\n[Open in ChatGPT](https://chatgpt.com/c/json-text)\n\n## You\n\n{\"content_type\": not valid json\n\n## ChatGPT\n\nDone\n");
});

test("chatgpt adapter exports only the active conversation branch", async () => {
  const document = await fetchSource(runtime(async (input) => {
    const url = String(input);
    if (url === "https://chatgpt.com/api/auth/session") return response({ accessToken: "token", account: { id: "account" } });
    if (url === "https://chatgpt.com/backend-api/conversation/branched") return response({
      conversation_id: "branched",
      title: "Branched",
      update_time: 1781092800,
      current_node: "a2",
      mapping: {
        root: { message: null, parent: null, children: ["u1"] },
        u1: { message: { id: "u1", create_time: 1, author: { role: "user" }, content: { content_type: "text", parts: ["Question"] } }, parent: "root", children: ["a1", "a2"] },
        a1: { message: { id: "a1", create_time: 2, author: { role: "assistant" }, content: { content_type: "text", parts: ["Old branch"] } }, parent: "u1", children: [] },
        a2: { message: { id: "a2", create_time: 3, author: { role: "assistant" }, content: { content_type: "text", parts: ["Current branch"] } }, parent: "u1", children: [] },
      },
    });
    throw new Error(url);
  }), "https://chatgpt.com/c/branched", serviceCatalog);
  assert.equal(document.markdown, "# Branched\n\n[Open in ChatGPT](https://chatgpt.com/c/branched)\n\n## You\n\nQuestion\n\n## ChatGPT\n\nCurrent branch\n");
});

test("chatgpt adapter keeps visible assistant replies that look like process updates", async () => {
  const document = await fetchSource(runtime(async (input) => {
    const url = String(input);
    if (url === "https://chatgpt.com/api/auth/session") return response({ accessToken: "token", account: { id: "account" } });
    if (url === "https://chatgpt.com/backend-api/conversation/process-text") return response({
      conversation_id: "process-text",
      title: "Filter",
      update_time: 1781092800,
      mapping: {
        user: { message: { id: "1", create_time: 1, author: { role: "user" }, content: { content_type: "text", parts: ["Can you check this?"] } } },
        assistant: { message: { id: "2", create_time: 2, author: { role: "assistant" }, content: { content_type: "text", parts: ["I'll check the contract and reply tomorrow."] } } },
      },
    });
    throw new Error(url);
  }), "https://chatgpt.com/c/process-text", serviceCatalog);
  assert.equal(document.markdown, "# Filter\n\n[Open in ChatGPT](https://chatgpt.com/c/process-text)\n\n## You\n\nCan you check this?\n\n## ChatGPT\n\nI'll check the contract and reply tomorrow.\n");
});

test("chatgpt adapter rejects HTML challenges without browser-backed fetch", async () => {
  await assert.rejects(() => fetchSource(runtime(async (input) => {
    if (String(input) === "https://chatgpt.com/api/auth/session") return response(null, "<!doctype html>");
    throw new Error(String(input));
  }), "https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog), /wire chatgpt login/);
});

test("chatgpt adapter points expired sessions to the login command", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      if (String(input) === "https://chatgpt.com/api/auth/session") return response({ error: "RefreshAccessTokenError", accessToken: "expired", account: { id: "account" } });
      throw new Error(String(input));
    }), "https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog),
    /wire chatgpt login/,
  );
});

test("chatgpt adapter points rejected conversation downloads to the login command", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      if (String(input) === "https://chatgpt.com/api/auth/session") return response({ accessToken: "token", account: { id: "account" } });
      return new Response(JSON.stringify({ error: { code: "token_expired" }, status: 401 }), { status: 401, headers: { "content-type": "application/json" } });
    }), "https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000", serviceCatalog),
    /wire chatgpt login/,
  );
});

test("google docs adapter exports native markdown with saved cookies", async () => {
  const requests = [];
  const headers = [];
  const document = await fetchSource(runtime(async (input, init) => {
    requests.push(String(input));
    headers.push(init.headers);
    return exportResponse("Doc Title", "md", "**Title**\n\n| A | B |\n| --- | --- |\n| one | two |\n");
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog);
  assert.equal(document.title, "Doc Title");
  assert.equal(document.markdown, "**Title**\n\n| A | B |\n| --- | --- |\n| one | two |\n");
  assert.deepEqual(requests, ["https://docs.google.com/document/d/doc/export?format=md"]);
  assert.equal(headers[0].Cookie, "SID=google-session");
});

test("google docs adapter reports markdown export errors", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response("missing", { status: 404, headers: { "content-disposition": 'attachment; filename="Missing.md"' } })), "https://docs.google.com/document/d/missing/edit", serviceCatalog),
    /Google Docs Markdown export failed: HTTP 404/,
  );
});

test("google docs adapter points expired cookies to login", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response("expired", { status: 401 })), "https://docs.google.com/document/d/doc/edit", serviceCatalog),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
});

test("google docs adapter points login HTML exports to login", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } })), "https://docs.google.com/document/d/doc/edit", serviceCatalog),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
});

test("google forms adapter reads form questions and responses", async () => {
  const requests = [];
  const headers = [];
  const document = await fetchSource(runtime(async (input, init) => {
    requests.push(String(input));
    headers.push(init.headers);
    const url = new URL(String(input));
    if (url.pathname === "/v1/forms/form-id") return response({
      formId: "form-id",
      info: { title: "Feedback Form" },
      responderUri: "https://docs.google.com/forms/d/e/public/viewform",
      publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
      items: [
        { itemId: "item-1", title: "What went well?", questionItem: { question: { questionId: "q1", textQuestion: { paragraph: true } } } },
        { itemId: "item-2", title: "Score", questionItem: { question: { questionId: "q2", scaleQuestion: { low: 1, high: 10, lowLabel: "Low", highLabel: "High" } } } },
      ],
    });
    if (url.pathname === "/v1/forms/form-id/responses") return response({
      responses: [{ responseId: "r1", createTime: "2026-07-01T12:00:00Z", lastSubmittedTime: "2026-07-01T12:01:00Z", answers: { q1: { textAnswers: { answers: [{ value: "Strong execution" }] } }, q2: { textAnswers: { answers: [{ value: "9" }] } } } }],
    });
    throw new Error(String(input));
  }), "https://docs.google.com/forms/d/form-id/edit", serviceCatalog);
  assert.equal(document.title, "Feedback Form");
  assert.equal(document.markdown, "# Feedback Form\n\n- Form ID: form-id\n- Edit: https://docs.google.com/forms/d/form-id/edit\n- Responder: https://docs.google.com/forms/d/e/public/viewform\n- Published: true\n- Accepting responses: true\n\n## Items\n- What went well?\n  - itemId: item-1\n  - questionId: q1\n  - type: paragraph\n- Score\n  - itemId: item-2\n  - questionId: q2\n  - type: scale\n  - range: 1 to 10\n  - lowLabel: Low\n  - highLabel: High\n\n## Responses\n\nResponse count: 1\n\n### r1\n- Created: 2026-07-01T12:00:00Z\n- Submitted: 2026-07-01T12:01:00Z\n- q1: Strong execution\n- q2: 9\n");
  assert.deepEqual(requests, ["https://forms.googleapis.com/v1/forms/form-id", "https://forms.googleapis.com/v1/forms/form-id/responses"]);
  assert.equal(headers[0].authorization, "Bearer forms-token");
  assert.equal(document.data.responses.length, 1);
});

test("google forms adapter reports disabled API with enable URL", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => response({ error: { code: 403, message: "Google Forms API has not been used", status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED", domain: "googleapis.com", metadata: { service: "forms.googleapis.com", containerInfo: "917071888555", activationUrl: "https://console.developers.google.com/apis/api/forms.googleapis.com/overview?project=917071888555" } }] } }, undefined, { status: 403 })), "https://docs.google.com/forms/d/form-id/edit", serviceCatalog),
    /Google Forms API is disabled\. Enable it at https:\/\/console\.developers\.google\.com\/apis\/api\/forms\.googleapis\.com\/overview\?project=917071888555 then retry\./,
  );
});

test("google forms adapter reports missing token scopes", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => response({ error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED" } }, undefined, { status: 403 })), "https://docs.google.com/forms/d/form-id/edit", serviceCatalog),
    /Google Forms API token is missing required scopes/,
  );
});

test("google forms adapter is download-only", async () => {
  await assert.rejects(
    () => synchronizeSource(runtime(async () => response({ formId: "form-id", info: { title: "Feedback Form" } })), "https://docs.google.com/forms/d/form-id/edit", serviceCatalog, { markdown: "# Feedback Form\n" }, "# Local\n", "/workspace/form.md"),
    /Google Forms sync is download-only/,
  );
});

test("google docs adapter preserves resource keys in export URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Doc Title", "md", "Hello\n");
  }), "https://docs.google.com/document/d/doc/edit?resourcekey=doc-key", serviceCatalog);
  assert.equal(document.markdown, "Hello\n");
  assert.deepEqual(requests, ["https://docs.google.com/document/d/doc/export?format=md&resourcekey=doc-key"]);
});

test("google slides adapter exports PPTX slides as presentation markdown", async () => {
  const requests = [];
  const headers = [];
  const document = await fetchSource(runtime(async (input, init) => {
    requests.push(String(input));
    headers.push(init.headers);
    return pptxResponse("Deck Title", pptxEntries([
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>First Slide</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:rPr><a:hlinkClick r:id="rIdLink"/></a:rPr><a:t>Linked doc</a:t></a:r><a:r><a:t> and </a:t></a:r><a:r><a:rPr b="1"/><a:t>bold</a:t></a:r><a:r><a:t> plus </a:t></a:r><a:r><a:rPr i="1"/><a:t>italic</a:t></a:r><a:r><a:t> plus </a:t></a:r><a:r><a:rPr u="sng"/><a:t>underlined</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Second Slide</a:t></a:r></a:p><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Plain body</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ], { 1: { rIdLink: "https://example.com/doc" }, 2: {} }));
  }), "https://docs.google.com/presentation/d/deck/edit", serviceCatalog);
  assert.equal(document.title, "Deck Title");
  assert.equal(document.markdown, "## First Slide\n- [Linked doc](https://example.com/doc) and **bold** plus _italic_ plus <u>underlined</u>\n\n---\n\n## Second Slide\nPlain body\n");
  assert.equal(document.data.presentation, true);
  assert.deepEqual(requests, ["https://docs.google.com/presentation/d/deck/export?format=pptx"]);
  assert.equal(headers[0].Cookie, "SID=google-session");
});

test("google slides adapter preserves resource keys in export URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return pptxResponse("Deck Title", pptxEntries([
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ], { 1: {} }));
  }), "https://docs.google.com/presentation/u/0/d/deck/edit?resourcekey=deck-key", serviceCatalog);
  assert.equal(document.markdown, "## Hello\n");
  assert.deepEqual(requests, ["https://docs.google.com/presentation/d/deck/export?format=pptx&resourcekey=deck-key"]);
});

test("google docs adapter preserves non-default document tabs in export URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Doc Title", "md", "Hello\n");
  }), "https://docs.google.com/document/d/doc/edit?tab=t.second", serviceCatalog);
  assert.equal(document.markdown, "Hello\n");
  assert.equal(document.data.document_tab, "t.second");
  assert.deepEqual(requests, ["https://docs.google.com/document/d/doc/export?format=md&tab=t.second"]);
});

test("google docs adapter preserves fragment document tabs in export URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Doc Title", "md", "Hello\n");
  }), "https://docs.google.com/document/d/doc/edit#tab=t.second", serviceCatalog);
  assert.equal(document.markdown, "Hello\n");
  assert.equal(document.data.document_tab, "t.second");
  assert.deepEqual(requests, ["https://docs.google.com/document/d/doc/export?format=md&tab=t.second"]);
});

test("google docs adapter accepts account-scoped document URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Doc Title", "md", "Hello\n");
  }), "https://docs.google.com/document/u/0/d/doc/edit?resourcekey=doc-key", serviceCatalog);
  assert.equal(document.markdown, "Hello\n");
  assert.deepEqual(requests, ["https://docs.google.com/document/d/doc/export?format=md&resourcekey=doc-key"]);
});

test("google docs adapter reads encoded and bare export filenames", async () => {
  const encoded = await fetchSource(runtime(async () => exportResponseWithDisposition("attachment; filename*=UTF-8'en'Pay%20by%20Context.md", "Hello\n")), "https://docs.google.com/document/d/doc/edit", serviceCatalog);
  const bare = await fetchSource(runtime(async () => exportResponseWithDisposition("attachment; filename=Sheet Export.csv", "a\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(encoded.title, "Pay by Context");
  assert.equal(bare.title, "Sheet Export");
});

test("google docs adapter reports malformed export filenames", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => exportResponseWithDisposition("attachment", "Hello\n")), "https://docs.google.com/document/d/doc/edit", serviceCatalog),
    /Google Docs Markdown export did not include a filename/,
  );
});

test("google sheets adapter selects gid and emits markdown table", async () => {
  const requests = [];
  const headers = [];
  const document = await fetchSource(runtime(async (input, init) => {
    requests.push(String(input));
    headers.push(init.headers);
    return exportResponse("Sheet - Data", "csv", "a,\"b|c\"\r\n\"x\ny\",z\r\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(document.markdown, "| a | b\\|c |\n| --- | --- |\n| x<br>y | z |\n");
  assert.equal(document.title, "Sheet - Data");
  assert.equal(document.data.sheet_gid, "7");
  assert.deepEqual(document.data.rows, [["a", "b|c"], ["x\ny", "z"]]);
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=7"]);
  assert.equal(headers[0].Cookie, "SID=google-session");
});

test("google sheets adapter reads gid from hash with extra parameters", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Sheet - Data", "csv", "a\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit?gid=9#gid=7&range=A1:B2", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.equal(document.data.sheet_gid, "7");
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=7"]);
});

test("google sheets adapter accepts account-scoped spreadsheet URLs", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Sheet - Data", "csv", "a\n");
  }), "https://docs.google.com/spreadsheets/u/0/d/sheet/edit?gid=9#gid=9", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.equal(document.data.sheet_gid, "9");
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9"]);
});

test("google sheets adapter selects query gid and preserves resource keys", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Sheet - Data", "csv", "a\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit?resourcekey=sheet-key&gid=9", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.equal(document.data.sheet_gid, "9");
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9&resourcekey=sheet-key"]);
});

test("google sheets adapter preserves fragment resource keys", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Sheet - Data", "csv", "a\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=9&resourcekey=sheet-key", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.equal(document.data.sheet_gid, "9");
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9&resourcekey=sheet-key"]);
});

test("google sheets adapter ignores empty resource keys", async () => {
  const requests = [];
  const document = await fetchSource(runtime(async (input) => {
    requests.push(String(input));
    return exportResponse("Sheet - Data", "csv", "a\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit?resourcekey=&gid=9#gid=9", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.deepEqual(requests, ["https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9"]);
});

test("google sheets adapter rejects missing cookies without extraction", async () => {
  const files = {};
  const cookies = createCookiesCapability({
    exists: async (path) => path in files,
    readText: async (path) => files[path],
    writeText: async (path, contents) => { files[path] = contents; },
    delete: async (path) => { delete files[path]; },
  }, () => "/home");
  await assert.rejects(
    () => fetchSource(Object.freeze({ ...runtime(async () => {
      throw new Error("unused");
    }), cookies }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
});

test("google sheets adapter points expired cookies to login", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response("expired", { status: 403 })), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
});

test("google sheets adapter points login HTML exports to login", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } })), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
});

test("google sheets adapter reports malformed export filenames", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async () => exportResponseWithDisposition("attachment", "a\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog),
    /Google Sheets CSV export did not include a filename/,
  );
});

test("google sheets adapter selects the first sheet when gid is omitted", async () => {
  const document = await fetchSource(runtime(async (input) => {
    assert.equal(String(input), "https://docs.google.com/spreadsheets/d/sheet/export?format=csv");
    return exportResponse("Sheet - First", "csv", "a\r\n");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit", serviceCatalog);
  assert.equal(document.markdown, "| a |\n| --- |\n");
  assert.equal(document.data.sheet_gid, null);
});

test("google sheets adapter renders empty tabs as empty markdown", async () => {
  const document = await fetchSource(runtime(async (input) => {
    assert.equal(String(input), "https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=7");
    return exportResponse("Sheet - Data", "csv", "");
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(document.markdown, "");
});

test("google sheets adapter preserves literal html-looking cell text", async () => {
  const document = await fetchSource(runtime(async () => exportResponse("Sheet - Data", "csv", "literal<br>,\"line\nbreak\",a&b,<tag>,&lt;br&gt;,&amp;lt;br&amp;gt;\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(document.markdown, "| literal&lt;br&gt; | line<br>break | a&b | <tag> | &amp;lt;br&amp;gt; | &amp;amp;lt;br&amp;amp;gt; |\n| --- | --- | --- | --- | --- | --- |\n");
  assert.deepEqual(document.data.rows, [["literal<br>", "line\nbreak", "a&b", "<tag>", "&lt;br&gt;", "&amp;lt;br&amp;gt;"]]);
});

test("google sheets adapter preserves quoted commas and double quotes", async () => {
  const document = await fetchSource(runtime(async () => exportResponse("Sheet - Data", "csv", "id,text\n1,\"said \"\"hello, world\"\"\"\n2,\"comma, pipe | quote \"\"\"\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(document.markdown, "| id | text |\n| --- | --- |\n| 1 | said \"hello, world\" |\n| 2 | comma, pipe \\| quote \" |\n");
  assert.deepEqual(document.data.rows, [["id", "text"], ["1", "said \"hello, world\""], ["2", "comma, pipe | quote \""]]);
});

test("google sheets adapter preserves leading and trailing whitespace in cells", async () => {
  const document = await fetchSource(runtime(async () => exportResponse("Sheet - Data", "csv", "\" leading\",\"trailing \",\" both \",\"\tindent\t\",&#32;,&#9;,&amp;#32;,&amp;#9;\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  assert.equal(document.markdown, "| &#32;leading | trailing&#32; | &#32;both&#32; | &#9;indent&#9; | &amp;#32; | &amp;#9; | &amp;amp;#32; | &amp;amp;#9; |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n");
  assert.deepEqual(document.data.rows, [[" leading", "trailing ", " both ", "\tindent\t", "&#32;", "&#9;", "&amp;#32;", "&amp;#9;"]]);
});

test("google docs synchronization downloads remote-only changes", async () => {
  const document = await synchronizeSource(runtime(async () => exportResponse("Doc Title", "md", "remote\n")), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "base\n" }, "base\n", "/workspace/doc.md");
  assert.equal(document.markdown, "remote\n");
});

test("google docs synchronization uploads local-only text edits", async () => {
  const requests = [];
  let markdown = "Hello old world\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      const params = new URLSearchParams(init.body);
      const bundles = JSON.parse(params.get("bundles"));
      assert.equal(params.get("rev"), "7");
      assert.equal(url.searchParams.get("token"), "token-1");
      assert.equal(url.searchParams.get("ouid"), "user-1");
      assert.deepEqual(bundles, [{ commands: [{ ty: "ds", si: 7, ei: 9 }, { ty: "is", ibi: 7, s: "new" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = "Hello new world\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello new world\n");
  assert.deepEqual(requests.map((request) => request.url.pathname), ["/document/d/doc/export", "/document/d/doc/edit", "/document/d/doc/save", "/document/d/doc/export"]);
});

test("google docs synchronization preserves non-default tabs while saving", async () => {
  const requests = [];
  let markdown = "Hello old world\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/edit")) {
      assert.equal(url.searchParams.get("tab"), "t.second");
      return docsHtml(markdown);
    }
    if (url.pathname.endsWith("/save")) {
      assert.equal(url.searchParams.get("tab"), "t.second");
      assert.equal(init.headers.referer, "https://docs.google.com/document/d/doc/edit?tab=t.second");
      markdown = "Hello new world\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit?tab=t.second", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello new world\n");
  assert.deepEqual(requests.map((request) => request.url.toString()), [
    "https://docs.google.com/document/d/doc/export?format=md&tab=t.second",
    "https://docs.google.com/document/d/doc/edit?tab=t.second",
    "https://docs.google.com/document/d/doc/save?id=doc&sid=0000019eb1675600&vc=1&c=1&w=1&flr=0&smv=2147483647&smb=%5B2147483647%2C+AAE%3D%5D&token=token-1&ouid=user-1&includes_info_params=true&cros_files=false&nded=false&tab=t.second",
    "https://docs.google.com/document/d/doc/export?format=md&tab=t.second",
  ]);
});

test("google docs synchronization points expired save cookies to login", async () => {
  const requests = [];
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return docsHtml("Hello old world\n");
      if (url.pathname.endsWith("/save")) return new Response("expired", { status: 403 });
      return exportResponse("Doc Title", "md", "Hello old world\n");
    }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/document/d/doc/export", "/document/d/doc/edit", "/document/d/doc/save"]);
});

test("google docs synchronization points login HTML save to login", async () => {
  const requests = [];
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return docsHtml("Hello old world\n");
      if (url.pathname.endsWith("/save")) return new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } });
      return exportResponse("Doc Title", "md", "Hello old world\n");
    }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/document/d/doc/export", "/document/d/doc/edit", "/document/d/doc/save"]);
});

test("google docs synchronization reports save acknowledgements without revision ranges", async () => {
  const requests = [];
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return docsHtml("Hello old world\n");
      if (url.pathname.endsWith("/save")) return response({}, ")]}'\n{}");
      return exportResponse("Doc Title", "md", "Hello old world\n");
    }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md"),
    /Google Docs save failed: missing revision ranges/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/document/d/doc/export", "/document/d/doc/edit", "/document/d/doc/save"]);
});

test("google docs synchronization points login HTML editor to login", async () => {
  const requests = [];
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } });
      return exportResponse("Doc Title", "md", "Hello old world\n");
    }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/document/d/doc/export", "/document/d/doc/edit"]);
});

test("google docs synchronization reports editor metadata failures", async () => {
  const requests = [];
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return new Response('<script>_docs_flag_initialData={"info_params":{"token":"token-1"}}</script>');
      return exportResponse("Doc Title", "md", "Hello old world\n");
    }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello old world\n" }, "Hello new world\n", "/workspace/doc.md"),
    /Google Docs editor did not include save metadata/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/document/d/doc/export", "/document/d/doc/edit"]);
});

test("google docs synchronization uploads local-only insertion at document end", async () => {
  let markdown = "Hello\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 7, s: "again" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = "Hello\nagain";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "Hello\nagain", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\nagain");
});

test("google docs synchronization uploads local-only insertion after formatted heading", async () => {
  let markdown = "# **Title**\n\nBody **bold** text\nMore words\n";
  const local = "# **Title**\n\nWIRE_SYNC_PROBE_20260617\n\nBody **bold** text\nMore words\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Title\n\nBody bold text\nMore words\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps insertions from the preceding paragraph when the following heading text differs", async () => {
  const before = "# **Title**\n\nBackground Kunal reference\n\nTldr; Cindy didn’t miss major cases. \n\n";
  let markdown = `${before}# **Kunal**\n\nSummary text\n`;
  const local = `${before}WIRE_SYNC_PROBE_20260617\n\n# **Kunal**\n\nSummary text\n`;
  const editorText = "Title\n\nBackground Kunal reference\n\nTldr; Cindy didn’t miss major cases. \nKunalSummary text\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(editorText);
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: editorText.indexOf("KunalSummary text") + 1, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around italic markdown anchors", async () => {
  let markdown = "Intro\n\nFelix: *As eng DRI*\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nFelix: *As eng DRI*\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nFelix: As eng DRI\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around underscore emphasis markdown anchors", async () => {
  let markdown = "Intro\n\nFelix: _As eng DRI_ and __bold callout__\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nFelix: _As eng DRI_ and __bold callout__\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nFelix: As eng DRI and bold callout\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around inline code markdown anchors", async () => {
  let markdown = "Intro\n\nFelix: `inline code`\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nFelix: `inline code`\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nFelix: inline code\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around strikethrough markdown anchors", async () => {
  let markdown = "Intro\n\nFelix: ~~old wording~~\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nFelix: ~~old wording~~\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nFelix: old wording\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around fenced code markdown anchors", async () => {
  let markdown = "Intro\n\n```js\nconst answer = 42;\n```\n\nFelix: done\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n```js\nconst answer = 42;\n```\n\nFelix: done\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nconst answer = 42;\n\nFelix: done\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around unordered list markdown anchors", async () => {
  let markdown = "Intro\n\n- Alpha item\n- Beta item\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n- Alpha item\n- Beta item\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nAlpha item\nBeta item\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around ordered list markdown anchors", async () => {
  let markdown = "Intro\n\n1. Alpha item\n2. Beta item\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n1. Alpha item\n2. Beta item\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nAlpha item\nBeta item\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around blockquote markdown anchors", async () => {
  let markdown = "Intro\n\n> Escalate carefully\n> Keep context\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n> Escalate carefully\n> Keep context\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nEscalate carefully\nKeep context\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around checklist markdown anchors", async () => {
  let markdown = "Intro\n\n- [ ] Draft plan\n- [x] Ship fix\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n- [ ] Draft plan\n- [x] Ship fix\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nDraft plan\nShip fix\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around nested blockquote markdown anchors", async () => {
  let markdown = "Intro\n\n>> Escalate carefully\n>> Keep context\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n>> Escalate carefully\n>> Keep context\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nEscalate carefully\nKeep context\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around autolink markdown anchors", async () => {
  let markdown = "Intro\n\nReference: <https://example.com/path?q=1>\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nReference: <https://example.com/path?q=1>\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nReference: https://example.com/path?q=1\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around reference link markdown anchors", async () => {
  let markdown = "Intro\n\n[Reference][ref]\n\n[ref]: https://example.com/path?q=1\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n[Reference][ref]\n\n[ref]: https://example.com/path?q=1\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nReference\n\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around image markdown anchors", async () => {
  let markdown = "Intro\n\n![Diagram](images/image1.png)\nAfter image\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n![Diagram](images/image1.png)\nAfter image\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nAfter image\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around inline image markdown anchors", async () => {
  let markdown = "Intro\n\nBefore ![Diagram](images/image1.png) after\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nBefore ![Diagram](images/image1.png) after\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nBefore after\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around inline reference image markdown anchors", async () => {
  let markdown = "Intro\n\nBefore ![Diagram][image-ref] after\n\n[image-ref]: images/image1.png\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nBefore ![Diagram][image-ref] after\n\n[image-ref]: images/image1.png\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nBefore after\n\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around horizontal rule markdown anchors", async () => {
  let markdown = "Intro\n\n---\n\nAfter rule\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n---\n\nAfter rule\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nAfter rule\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps around table markdown anchors", async () => {
  let markdown = "Intro\n\n| Name | Status |\n| --- | --- |\n| Alpha | Done |\n\nAfter table\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\n| Name | Status |\n| --- | --- |\n| Alpha | Done |\n\nAfter table\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nName\nStatus\nAlpha\nDone\n\nAfter table\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization uses context to update repeated text", async () => {
  let markdown = "one target two target three\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "ds", si: 16, ei: 21 }, { ty: "is", ibi: 16, s: "value" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = "one target two value three\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "one target two target three\n" }, "one target two value three\n", "/workspace/doc.md");
  assert.equal(document.markdown, "one target two value three\n");
});

test("google docs synchronization uploads multi-line local replacements", async () => {
  let markdown = "A\nold\nC\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "ds", si: 3, ei: 5 }, { ty: "is", ibi: 3, s: "new\nline" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = "A\nnew\nline\nC\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "A\nold\nC\n" }, "A\nnew\nline\nC\n", "/workspace/doc.md");
  assert.equal(document.markdown, "A\nnew\nline\nC\n");
});

test("google docs synchronization maps Google-exported hard-break spaces", async () => {
  let markdown = "Hello\nMarker  \n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Hello\nMarker\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "ds", si: 7, ei: 13 }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = "Hello\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\nMarker  \n" }, "Hello\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\n");
});

test("google docs synchronization accepts Google-escaped punctuation after upload", async () => {
  let markdown = "Hello\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      markdown = "Hello\nWIRE\\_SYNC\\_PROBE\\_20260616  \n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "Hello\nWIRE_SYNC_PROBE_20260616\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\nWIRE\\_SYNC\\_PROBE\\_20260616  \n");
});

test("google docs synchronization maps Google-escaped equals and tilde anchors", async () => {
  let markdown = "Intro\n\nDoes chat limit \\= default limit?\nScope increase by \\~0.5d\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nDoes chat limit \\= default limit?\nScope increase by \\~0.5d\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nDoes chat limit = default limit?\nScope increase by ~0.5d\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization maps Google-exported html entity anchors", async () => {
  let markdown = "Intro\n\nA &amp; B &lt; C &gt; D &quot;quote&quot; &#39;single&#39;\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nA &amp; B &lt; C &gt; D &quot;quote&quot; &#39;single&#39;\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nA & B < C > D \"quote\" 'single'\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization accepts Google-exported html entities after upload", async () => {
  let markdown = "Hello\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      markdown = "Hello\nA &amp; B &lt; C  \n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "Hello\nA & B < C\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\nA &amp; B &lt; C  \n");
});

test("google docs synchronization maps Google-exported inline html formatting anchors", async () => {
  let markdown = "Intro\n\nUse <u>underlined</u>, <sup>raised</sup>, and <span style=\"color:red\">colored</span> words\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nUse <u>underlined</u>, <sup>raised</sup>, and <span style=\"color:red\">colored</span> words\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nUse underlined, raised, and colored words\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization accepts Google-exported inline html formatting after upload", async () => {
  let markdown = "Hello\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      markdown = "Hello\nUse <u>underlined</u> text  \n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "Hello\nUse underlined text\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\nUse <u>underlined</u> text  \n");
});

test("google docs synchronization maps Google-exported combined emphasis anchors", async () => {
  let markdown = "Intro\n\nUse ***bold italic***, ___strong em___, **_bold under_**, __*strong star*__, *__star strong__*, and _**under bold**_ words\n";
  const local = "Intro\n\nWIRE_SYNC_PROBE_20260617\n\nUse ***bold italic***, ___strong em___, **_bold under_**, __*strong star*__, *__star strong__*, and _**under bold**_ words\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml("Intro\n\nUse bold italic, strong em, bold under, strong star, star strong, and under bold words\n");
    if (url.pathname.endsWith("/save")) {
      const bundles = JSON.parse(new URLSearchParams(init.body).get("bundles"));
      assert.deepEqual(bundles, [{ commands: [{ ty: "is", ibi: 8, s: "WIRE_SYNC_PROBE_20260617\n\n" }], sid: "0000019eb1675600", reqId: 0 }]);
      markdown = local;
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown }, local, "/workspace/doc.md");
  assert.equal(document.markdown, local);
});

test("google docs synchronization accepts Google-exported combined emphasis after upload", async () => {
  let markdown = "Hello\n";
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return docsHtml(markdown);
    if (url.pathname.endsWith("/save")) {
      markdown = "Hello\nUse ***bold italic*** and ___strong em___ text  \n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Doc Title", "md", markdown);
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "Hello\nUse bold italic and strong em text\n", "/workspace/doc.md");
  assert.equal(document.markdown, "Hello\nUse ***bold italic*** and ___strong em___ text  \n");
});

test("google docs synchronization rejects formatting-only local Markdown edits before saving", async () => {
  const requests = [];
  await assert.rejects(() => synchronizeSource(runtime(async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname.endsWith("/edit") || url.pathname.endsWith("/save")) throw new Error("unexpected write");
    return exportResponse("Doc Title", "md", "Hello\n");
  }), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "Hello\n" }, "**Hello**\n", "/workspace/doc.md"), /Google Docs sync cannot upload formatting-only Markdown edits/);
  assert.deepEqual(requests, ["/document/d/doc/export"]);
});

test("google docs synchronization rejects local and remote conflicts", async () => {
  await assert.rejects(
    () => synchronizeSource(runtime(async () => exportResponse("Doc Title", "md", "remote\n")), "https://docs.google.com/document/d/doc/edit", serviceCatalog, { markdown: "base\n" }, "local\n", "/workspace/doc.md"),
    /Google Docs changed remotely and locally/,
  );
});

test("google slides synchronization is download-only for local edits", async () => {
  await assert.rejects(
    () => synchronizeSource(runtime(async () => pptxResponse("Deck Title", pptxEntries([
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Base</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ], { 1: {} }))), "https://docs.google.com/presentation/d/deck/edit", serviceCatalog, { markdown: "## Base\n" }, "local\n", "/workspace/deck.md"),
    /Google Slides sync is download-only/,
  );
});

test("google sheets synchronization uploads local-only table edits", async () => {
  const requests = [];
  let csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      const params = new URLSearchParams(init.body);
      const bundles = JSON.parse(params.get("bundles"));
      assert.equal(params.get("rev"), "7");
      assert.equal(url.searchParams.get("token"), "token-1");
      assert.deepEqual(bundles, [{ commands: [[21299578, "[[\"7\",1,2,0,1],[132274236,3,[2,\"new\"],null,null,0],[null,[[null,513,[0],null,null,null,null,null,null,null,null,0]]]]"]], sid: "sid-1", reqId: 0 }]);
      csv = "id,name\nnew,Name\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | name |\n| --- | --- |\n| new | Name |\n");
  assert.deepEqual(requests.map((request) => request.url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit", "/spreadsheets/u/0/d/sheet/save", "/spreadsheets/d/sheet/export"]);
});

test("google sheets synchronization points expired save cookies to login", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return sheetHtml();
      if (url.pathname.endsWith("/save")) return new Response("expired", { status: 401 });
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit", "/spreadsheets/u/0/d/sheet/save"]);
});

test("google sheets synchronization points login HTML save to login", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return sheetHtml();
      if (url.pathname.endsWith("/save")) return new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } });
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit", "/spreadsheets/u/0/d/sheet/save"]);
});

test("google sheets synchronization reports save acknowledgements without revision ranges", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return sheetHtml();
      if (url.pathname.endsWith("/save")) return response({}, ")]}'\n{}");
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md"),
    /Google Sheets save failed: missing revision ranges/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit", "/spreadsheets/u/0/d/sheet/save"]);
});

test("google sheets synchronization points login HTML editor to login", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } });
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md"),
    /google-docs cookie authentication is missing or expired\. Run `wire google-docs login` once; other commands reuse saved cookies\./,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit"]);
});

test("google sheets synchronization reports editor metadata failures", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/edit")) return new Response('<script>_docs_flag_initialData={"info_params":{"token":"token-1"}}</script>');
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md"),
    /Google Sheets editor did not include save metadata/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export", "/spreadsheets/d/sheet/edit"]);
});

test("google sheets synchronization ignores Markdown-only table separator changes", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| :--- | ---: |\n| old | Name |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | name |\n| --- | --- |\n| old | Name |\n");
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export"]);
});

test("google sheets synchronization rejects stray non-table lines before saving", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| old | Name |\n\nlocal note\n", "/workspace/sheet.md"),
    /Google Sheets sync requires a Markdown table: line 4 is not a table row/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export"]);
});

test("google sheets synchronization rejects ragged Markdown rows before saving", async () => {
  const requests = [];
  const csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  await assert.rejects(
    () => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| old | Name | accidental |\n", "/workspace/sheet.md"),
    /Google Sheets sync requires every Markdown table row to have 2 cells: line 3 has 3/,
  );
  assert.deepEqual(requests.map((url) => url.pathname), ["/spreadsheets/d/sheet/export"]);
});

test("google sheets synchronization uses query gid and resource key for editor requests", async () => {
  const requests = [];
  let csv = "id,name\nold,Name\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit?resourcekey=sheet-key&gid=9", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/edit")) {
      assert.equal(url.searchParams.get("gid"), "9");
      assert.equal(url.searchParams.get("resourcekey"), "sheet-key");
      return sheetHtml();
    }
    if (url.pathname.endsWith("/save")) {
      csv = "id,name\nnew,Name\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit?resourcekey=sheet-key&gid=9", serviceCatalog, base.data, "| id | name |\n| --- | --- |\n| new | Name |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | name |\n| --- | --- |\n| new | Name |\n");
  assert.deepEqual(requests.map((request) => request.url.toString()), [
    "https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9&resourcekey=sheet-key",
    "https://docs.google.com/spreadsheets/d/sheet/edit?gid=9&resourcekey=sheet-key",
    "https://docs.google.com/spreadsheets/u/0/d/sheet/save?id=sheet&token=token-1",
    "https://docs.google.com/spreadsheets/d/sheet/export?format=csv&gid=9&resourcekey=sheet-key",
  ]);
});

test("google sheets synchronization uploads row growth, column growth, blanks, and escaped cells", async () => {
  let csv = "id,value\n1,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 0, column: 2, value: "note" },
        { row: 1, column: 1, value: "" },
        { row: 1, column: 2, value: "a|b" },
        { row: 2, column: 0, value: "2" },
        { row: 2, column: 1, value: "line\nbreak" },
        { row: 2, column: 2, value: "literal<br>" },
      ]);
      csv = "id,value,note\n1,,a|b\n2,\"line\nbreak\",literal<br>\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | value | note |\n| --- | --- | --- |\n| 1 |  | a\\|b |\n| 2 | line<br>break | literal&lt;br&gt; |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | value | note |\n| --- | --- | --- |\n| 1 |   | a\\|b |\n| 2 | line<br>break | literal&lt;br&gt; |\n");
});

test("google sheets synchronization uploads quoted commas and double quotes", async () => {
  let csv = "id,text\n1,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 1, column: 1, value: "said \"hello, world\"" },
        { row: 2, column: 0, value: "2" },
        { row: 2, column: 1, value: "comma, pipe | quote \"" },
      ]);
      csv = "id,text\n1,\"said \"\"hello, world\"\"\"\n2,\"comma, pipe | quote \"\"\"\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | text |\n| --- | --- |\n| 1 | said \"hello, world\" |\n| 2 | comma, pipe \\| quote \" |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | text |\n| --- | --- |\n| 1 | said \"hello, world\" |\n| 2 | comma, pipe \\| quote \" |\n");
});

test("google sheets synchronization rejects formula-like local cells before saving", async () => {
  for (const value of ["=1+1", "+1+1", "@SUM(A1:A2)", "-SUM(A1:A2)"]) {
    let csv = "id,value\n1,old\n";
    const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
    const requests = [];
    await assert.rejects(() => synchronizeSource(runtime(async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname.endsWith("/edit") || url.pathname.endsWith("/save")) throw new Error("unexpected write");
      return exportResponse("Sheet Title", "csv", csv);
    }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, `| id | value |\n| --- | --- |\n| 1 | ${value} |\n`, "/workspace/sheet.md"), /Google Sheets sync cannot upload formula-like cell text at row 2, column 2\nPrefix it with an apostrophe or rewrite it as plain text before syncing\./);
    assert.deepEqual(requests, ["/spreadsheets/d/sheet/export"]);
  }
});

test("google sheets synchronization uploads negative numeric local cells", async () => {
  let csv = "id,value\n1,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [{ row: 1, column: 1, value: "-1.5" }]);
      csv = "id,value\n1,-1.5\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | value |\n| --- | --- |\n| 1 | -1.5 |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | value |\n| --- | --- |\n| 1 | -1.5 |\n");
});

test("google sheets synchronization uploads row and column shrink", async () => {
  let csv = "id,value,note\n1,keep,drop\n2,remove,drop\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 0, column: 2, value: "" },
        { row: 1, column: 2, value: "" },
        { row: 2, column: 0, value: "" },
        { row: 2, column: 1, value: "" },
        { row: 2, column: 2, value: "" },
      ]);
      csv = "id,value\n1,keep\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | value |\n| --- | --- |\n| 1 | keep |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | value |\n| --- | --- |\n| 1 | keep |\n");
});

test("google sheets synchronization uploads middle row removal by shifting following rows", async () => {
  let csv = "id,value\n1,one\n2,two\n3,three\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 2, column: 0, value: "3" },
        { row: 2, column: 1, value: "three" },
        { row: 3, column: 0, value: "" },
        { row: 3, column: 1, value: "" },
      ]);
      csv = "id,value\n1,one\n3,three\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | value |\n| --- | --- |\n| 1 | one |\n| 3 | three |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | value |\n| --- | --- |\n| 1 | one |\n| 3 | three |\n");
});

test("google sheets synchronization preserves literal backslashes while parsing escaped pipes", async () => {
  let csv = "id,path,pattern\n1,old,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 1, column: 1, value: "C:\\Users\\Name" },
        { row: 1, column: 2, value: "a\\b|c\\" },
      ]);
      csv = "id,path,pattern\n1,C:\\Users\\Name,a\\b|c\\\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | path | pattern |\n| --- | --- | --- |\n| 1 | C:\\Users\\Name | a\\b\\|c\\ |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | path | pattern |\n| --- | --- | --- |\n| 1 | C:\\Users\\Name | a\\b\\|c\\ |\n");
});

test("google sheets synchronization distinguishes literal br entities from br tags", async () => {
  let csv = "id,entity,tag,escaped\n1,old,old,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 1, column: 1, value: "&lt;br&gt;" },
        { row: 1, column: 2, value: "<br>" },
        { row: 1, column: 3, value: "&amp;lt;br&amp;gt;" },
      ]);
      csv = "id,entity,tag,escaped\n1,&lt;br&gt;,<br>,&amp;lt;br&amp;gt;\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | entity | tag | escaped |\n| --- | --- | --- | --- |\n| 1 | &amp;lt;br&amp;gt; | &lt;br&gt; | &amp;amp;lt;br&amp;amp;gt; |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | entity | tag | escaped |\n| --- | --- | --- | --- |\n| 1 | &amp;lt;br&amp;gt; | &lt;br&gt; | &amp;amp;lt;br&amp;amp;gt; |\n");
});

test("google sheets synchronization uploads encoded edge whitespace literally", async () => {
  let csv = "id,value\n1,old\n";
  const base = await fetchSource(runtime(async () => exportResponse("Sheet Title", "csv", csv)), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog);
  const document = await synchronizeSource(runtime(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/edit")) return sheetHtml();
    if (url.pathname.endsWith("/save")) {
      assert.deepEqual(sheetBundleCells(init.body), [
        { row: 1, column: 1, value: " new " },
        { row: 2, column: 0, value: "2" },
        { row: 2, column: 1, value: "\ttab\t" },
        { row: 3, column: 0, value: "3" },
        { row: 3, column: 1, value: "&#32;" },
        { row: 4, column: 0, value: "4" },
        { row: 4, column: 1, value: "&amp;#32;" },
        { row: 5, column: 0, value: "5" },
        { row: 5, column: 1, value: "&amp;#9;" },
      ]);
      csv = "id,value\n1,\" new \"\n2,\"\ttab\t\"\n3,&#32;\n4,&amp;#32;\n5,&amp;#9;\n";
      return response({ revisionRanges: [[8, 8]] }, ")]}'\n{\"revisionRanges\":[[8,8]]}");
    }
    return exportResponse("Sheet Title", "csv", csv);
  }), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, base.data, "| id | value |\n| --- | --- |\n| 1 | &#32;new&#32; |\n| 2 | &#9;tab&#9; |\n| 3 | &amp;#32; |\n| 4 | &amp;amp;#32; |\n| 5 | &amp;amp;#9; |\n", "/workspace/sheet.md");
  assert.equal(document.markdown, "| id | value |\n| --- | --- |\n| 1 | &#32;new&#32; |\n| 2 | &#9;tab&#9; |\n| 3 | &amp;#32; |\n| 4 | &amp;amp;#32; |\n| 5 | &amp;amp;#9; |\n");
});

test("google sheets synchronization rejects local and remote conflicts with sheet wording", async () => {
  await assert.rejects(
    () => synchronizeSource(runtime(async () => exportResponse("Sheet Title", "csv", "remote\n")), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7", serviceCatalog, { markdown: "| base |\n| --- |\n" }, "| local |\n| --- |\n", "/workspace/sheet.md"),
    /Google Sheets changed remotely and locally\. Resolve the conflict in Google Sheets or the local Markdown file before syncing again\./,
  );
});

test("zoom adapter performs auth exchange and renders transcript", async () => {
  const zoomRuntime = runtime(async (input) => {
    const url = String(input);
    if (url.endsWith("csrf_js")) return response(null, "token: csrf");
    if (url.includes("/nak?")) return response(null, "header.payload.signature");
    if (url.includes("batch_get")) return response({ successItems: [{ title: "Meeting", fileLink: "https://hub.zoom.us/doc/id", meetingNotes: { meetingId: "meeting", mainMeetingId: "main" }, owner: { ownerName: "Owner" }, createdInfo: { time: "created" }, updatedInfo: { time: "updated" } }] });
    if (url.includes("transcript_status")) return response({ aicTranscript: { exist: true, canAccess: true } });
    return response({ meetingStartTime: 1781040729626, speakers: [{ userId: "u", username: "Alice" }], items: [{ startTime: "00:01", userId: "u", text: "Hello" }] });
  });
  const document = await fetchSource(Object.freeze({ ...zoomRuntime, clock: Object.freeze({ ...zoomRuntime.clock, localTimezone: () => "America/Chicago" }) }), "https://hub.zoom.us/doc/id", serviceCatalog);
  assert.equal(document.title, "2026-06-09-Meeting");
  assert.equal(document.markdown, "# Meeting\n\n- Meeting start: Jun 9, 2026, 4:32 PM CDT\n- Owner: Owner\n- Zoom document: https://hub.zoom.us/doc/id\n\n## Transcript\n\n- [00:01] **Alice:** Hello");
  assert.ok(!document.markdown.includes("State:"));
  assert.ok(!document.markdown.includes("Recording ID:"));
  assert.ok(!document.markdown.includes("Meeting ID:"));
  assert.ok(!document.markdown.includes("## Participants"));
});

test("zoom adapter uses meeting date before transcript title", async () => {
  const zoomRuntime = runtime(async (input) => {
    const url = String(input);
    if (url.endsWith("csrf_js")) return response(null, "token: csrf");
    if (url.includes("/nak?")) return response(null, "header.payload.signature");
    if (url.includes("batch_get")) return response({ successItems: [{ title: "Poe team meeting 2026-06-18 1630(GMT-500)", fileLink: "https://hub.zoom.us/doc/id", meetingNotes: { meetingId: "meeting", mainMeetingId: "main" }, owner: { ownerName: "Owner" }, createdInfo: { time: "created" }, updatedInfo: { time: "updated" } }] });
    if (url.includes("transcript_status")) return response({ aicTranscript: { exist: true, canAccess: true } });
    return response({ meetingStartTime: 1781818200000, speakers: [{ userId: "u", username: "Alice" }], items: [{ startTime: "00:01", userId: "u", text: "Hello" }] });
  });
  const document = await fetchSource(Object.freeze({ ...zoomRuntime, clock: Object.freeze({ ...zoomRuntime.clock, localTimezone: () => "America/Chicago" }) }), "https://hub.zoom.us/doc/id", serviceCatalog);
  assert.equal(document.title, "2026-06-18-Poe team meeting");
  assert.equal(markdownFilename(document.title), "2026-06-18-poe-team-meeting.md");
});

test("zoom adapter renders unknown transcript speakers as user ids", async () => {
  const zoomRuntime = runtime(async (input) => {
    const url = String(input);
    if (url.endsWith("csrf_js")) return response(null, "token: csrf");
    if (url.includes("/nak?")) return response(null, "header.payload.signature");
    if (url.includes("batch_get")) return response({ successItems: [{ title: "Meeting", fileLink: "https://hub.zoom.us/doc/id", meetingNotes: { meetingId: "meeting", mainMeetingId: "main" }, owner: { ownerName: "Owner" }, createdInfo: { time: "created" }, updatedInfo: { time: "updated" } }] });
    if (url.includes("transcript_status")) return response({ aicTranscript: { exist: true, canAccess: true } });
    return response({ meetingStartTime: 1781040729626, speakers: [{ userId: "u", username: "Alice" }], items: [{ startTime: "00:01", userId: "missing-user", text: "Hello" }] });
  });
  const document = await fetchSource(Object.freeze({ ...zoomRuntime, clock: Object.freeze({ ...zoomRuntime.clock, localTimezone: () => "UTC" }) }), "https://hub.zoom.us/doc/id", serviceCatalog);
  assert.match(document.markdown, /- \[00:01\] \*\*missing-user:\*\* Hello/);
  assert.ok(!document.markdown.includes("undefined"));
});

test("zoom adapter refreshes and persists cookies after every Zoom response", async () => {
  const sentCookies = [];
  const savedCookies = [];
  const initialCookies = Object.freeze([
    testCookie("zm_aid", "account", ".zoom.us"),
    testCookie("_zm_ssid", "old-session", ".zoom.us"),
    { ...testCookie("expired", "stale", ".zoom.us"), expires: 1 },
  ]);
  const zoomRuntime = runtime(async (input, init) => {
    const url = String(input);
    sentCookies.push({ url, cookie: init.headers.cookie });
    if (url.includes("/nak?")) {
      return new Response("header.payload.signature", { headers: [["set-cookie", "_zm_docs_nak=jwt; Domain=.zoom.us; Path=/; Max-Age=600; Secure; HttpOnly"]] });
    }
    if (url.includes("batch_get")) {
      assert.match(init.headers.cookie, /_zm_docs_nak=jwt/);
      assert.doesNotMatch(init.headers.cookie, /expired=stale/);
      return new Response(JSON.stringify({ successItems: [{ title: "Meeting", fileLink: "https://hub.zoom.us/doc/id", meetingNotes: { meetingId: "meeting", mainMeetingId: "main" }, owner: { ownerName: "Owner" }, createdInfo: { time: "created" }, updatedInfo: { time: "updated" } }] }), { headers: [["content-type", "application/json"], ["set-cookie", "docs_cookie=docs; Domain=.us01docs.zoom.us; Path=/; Secure; HttpOnly"]] });
    }
    if (url.includes("transcript_status")) {
      assert.match(init.headers.cookie, /docs_cookie=docs/);
      return new Response(JSON.stringify({ aicTranscript: { exist: true, canAccess: true } }), { headers: [["content-type", "application/json"], ["set-cookie", "csrf_refresh=deleted; Domain=.zoom.us; Path=/; Max-Age=0; Secure; HttpOnly"]] });
    }
    assert.match(init.headers.cookie, /_zm_docs_nak=jwt/);
    assert.match(init.headers.cookie, /docs_cookie=docs/);
    assert.doesNotMatch(init.headers.cookie, /csrf_refresh=/);
    return response({ meetingStartTime: 1781040729626, speakers: [{ userId: "u", username: "Alice" }], items: [{ startTime: "00:01", userId: "u", text: "Hello" }] });
  });
  await fetchSource(Object.freeze({
    ...zoomRuntime,
    cookies: Object.freeze({
      ...zoomRuntime.cookies,
      loadSaved: async () => initialCookies,
      metadata: async () => Object.freeze({}),
      save: async (_service, cookies) => { savedCookies.push(cookies); },
    }),
  }), "https://hub.zoom.us/doc/id", serviceCatalog);
  assert.equal(sentCookies[0].cookie.includes("expired=stale"), false);
  assert.equal(savedCookies.length, 4);
  const lastNames = savedCookies.at(-1).map((cookie) => cookie.name);
  assert.equal(lastNames.includes("_zm_docs_nak"), true);
  assert.equal(lastNames.includes("docs_cookie"), true);
  assert.equal(lastNames.includes("csrf_refresh"), false);
  assert.equal(lastNames.includes("expired"), false);
});

test("zoom adapter renders missing transcript state and ids", async () => {
  const zoomRuntime = runtime(async (input) => {
    const url = String(input);
    if (url.endsWith("csrf_js")) return response(null, "token: csrf");
    if (url.includes("/nak?")) return response(null, "header.payload.signature");
    if (url.includes("batch_get")) return response({ successItems: [{ title: "Meeting", fileLink: "https://hub.zoom.us/doc/id", meetingNotes: { meetingId: "meeting", mainMeetingId: "main" }, owner: { ownerName: "Owner" }, createdInfo: { time: "created" }, updatedInfo: { time: "updated" } }] });
    return response({ aicTranscript: { exist: false, canAccess: false } });
  });
  const document = await fetchSource(zoomRuntime, "https://hub.zoom.us/doc/id", serviceCatalog);
  assert.equal(document.markdown, "# Meeting\n\n- Transcript state: missing\n- Recording ID: id\n- Meeting ID: meeting\n- Main meeting ID: main\n- Owner: Owner\n- Zoom document: https://hub.zoom.us/doc/id");
});

test("zoom adapter reports missing saved authentication with login command", async () => {
  await assert.rejects(
    () => fetchSource(Object.freeze({ ...runtime(async () => response({})), cookies: Object.freeze({ load: async () => [], loadSaved: async () => null, metadata: async () => Object.freeze({}), save: async () => {}, delete: async () => {} }) }), "https://hub.zoom.us/doc/id", serviceCatalog),
    /Zoom authentication is missing or expired\. Run `wire zoom login` once; other commands reuse saved cookies\./,
  );
});

test("zoom adapter reports expired authentication with login command", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      const url = String(input);
      if (url.endsWith("csrf_js")) return response(null, "token: csrf");
      return new Response(JSON.stringify({ code: 30010201, msg: "User not login." }), { status: 401, headers: { "content-type": "application/json" } });
    }), "https://hub.zoom.us/doc/id", serviceCatalog),
    /Zoom authentication is missing or expired\. Run `wire zoom login` once; other commands reuse saved cookies\./,
  );
});

test("zoom adapter reports malformed JWT authentication with login command", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      const url = String(input);
      if (url.endsWith("csrf_js")) return response(null, "token: csrf");
      if (url.includes("/nak?")) return response(null, "not-a-jwt");
      return response({ successItems: [] });
    }), "https://hub.zoom.us/doc/id", serviceCatalog),
    /Zoom authentication is missing or expired\. Run `wire zoom login` once; other commands reuse saved cookies\./,
  );
});

test("zoom adapter reports API errors before reading batch document fields", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      const url = String(input);
      if (url.endsWith("csrf_js")) return response(null, "token: csrf");
      if (url.includes("/nak?")) return response(null, "header.payload.signature");
      return new Response(JSON.stringify({ error: "denied" }), { status: 403, headers: { "content-type": "application/json" } });
    }), "https://hub.zoom.us/doc/id", serviceCatalog),
    /Zoom Hub file batch_get failed: HTTP 403 {"error":"denied"}/,
  );
});

test("zoom adapter reports missing batch document before reading fields", async () => {
  await assert.rejects(
    () => fetchSource(runtime(async (input) => {
      const url = String(input);
      if (url.endsWith("csrf_js")) return response(null, "token: csrf");
      if (url.includes("/nak?")) return response(null, "header.payload.signature");
      return response({ successItems: [] });
    }), "https://hub.zoom.us/doc/id", serviceCatalog),
    /Zoom Hub file id was not returned by batch_get/,
  );
});

test("notion fetch renders canonical advanced Markdown", async () => {
  const pageId = "01234567-89ab-cdef-0123-456789abcdef";
  const blocks = {
    [pageId]: { id: pageId, type: "page", alive: true, properties: { title: [["Page"]] }, content: ["task", "empty-task", "list", "code", "table", "toggle-heading", "equation", "columns", "synced", "nested-page", "database"] },
    task: { id: "task", type: "to_do", alive: true, properties: { title: [["unchecked"]], checked: [["No"]] } },
    "empty-task": { id: "empty-task", type: "to_do", alive: true, properties: { title: [[""]], checked: [["No"]] }, content: ["empty-task-child"] },
    "empty-task-child": { id: "empty-task-child", type: "text", alive: true, properties: { title: [["child"]] } },
    list: { id: "list", type: "bulleted_list", alive: true, properties: { title: [["first\nsecond"]] } },
    code: { id: "code", type: "code", alive: true, properties: { title: [["const ticks = ```;"]], language: [["JavaScript"]] } },
    table: { id: "table", type: "table", alive: true, format: { table_block_column_order: ["a", "b"], table_block_column_header: true, table_block_row_header: false }, content: ["row"] },
    row: { id: "row", type: "table_row", alive: true, properties: { a: [["A"]], b: [["B|C\nD"]] } },
    "toggle-heading": { id: "toggle-heading", type: "sub_sub_header", alive: true, format: { toggleable: true }, properties: { title: [["Details"]] }, content: ["toggle-child"] },
    "toggle-child": { id: "toggle-child", type: "text", alive: true, properties: { title: [["inside"]] } },
    equation: { id: "equation", type: "equation", alive: true, properties: { title: [["x^2 + y^2"]] } },
    columns: { id: "columns", type: "column_list", alive: true, content: ["column"] },
    column: { id: "column", type: "column", alive: true, format: { column_ratio: 0.5 }, content: ["column-text"] },
    "column-text": { id: "column-text", type: "text", alive: true, properties: { title: [["column body"]] } },
    synced: { id: "synced", type: "transclusion_container", alive: true, content: ["synced-text"] },
    "synced-text": { id: "synced-text", type: "text", alive: true, properties: { title: [["shared"]] } },
    "nested-page": { id: "nested-page", type: "page", alive: true, properties: { title: [["Nested"]] }, content: ["nested-page-child"] },
    database: { id: "database", type: "collection_view", alive: true, format: { collection_pointer: { id: "collection", spaceId: "space" } } },
  };
  const requests = [];
  const document = await fetchSource(runtime(async (input, init = {}) => {
    const url = String(input);
    if (!url.includes("/api/v3/")) return response({});
    const path = url.split("/api/v3/")[1];
    const body = JSON.parse(init.body);
    requests.push({ path, body });
    if (path === "getSpaces") return response({ user: { space_view: { view: { spaceId: "space" } } } });
    if (path === "loadCachedPageChunkV2" && body.chunkNumber === 0) return response({ recordMap: { block: Object.fromEntries(Object.entries(blocks).filter(([id]) => !["row", "synced-text"].includes(id)).map(([id, value]) => [id, { value: { value } }])) }, cursors: [{ stack: [["cursor"]] }] });
    if (path === "loadCachedPageChunkV2") return response({ recordMap: { block: {} }, cursors: [] });
    if (path === "getRecordValues") return response({ results: body.requests.map(({ id }) => ({ value: blocks[id] })) });
    throw new Error(path);
  }), "https://www.notion.so/Page-0123456789abcdef0123456789abcdef", serviceCatalog);
  const expected = "# Page\n\n- [ ] unchecked\n:::to-do\n:::checked false\n\n  :::text\n  child\n  :::\n:::\n\n- first\n  second\n\n````JavaScript\nconst ticks = ```;\n````\n\n| A | B\\|C<br>D |\n| --- | --- |\n\n### Details {toggle}\n  inside\n\n:::equation\nx^2 + y^2\n:::\n\n:::columns\n  :::column\n  0.5\n    column body\n  :::\n:::\n\n:::synced\n  shared\n:::\n\n:::page\nNested\n:::\n\n:::notion-format\n:::format {\"collection_pointer\":{\"id\":\"collection\",\"spaceId\":\"space\"}}\n:::notion-opaque\n{\n  \"alive\": true,\n  \"format\": {\n    \"collection_pointer\": {\n      \"id\": \"collection\",\n      \"spaceId\": \"space\"\n    }\n  },\n  \"id\": \"database\",\n  \"type\": \"collection_view\"\n}\n:::\n:::";
  assert.equal(document.markdown, expected);
  assert.deepEqual(requests.map(({ path }) => path), ["getSpaces", "loadCachedPageChunkV2", "loadCachedPageChunkV2", "getRecordValues"]);
  assert.deepEqual(requests[3].body.requests, [{ table: "block", id: "synced-text" }, { table: "block", id: "row" }]);
});

test("catalog source values remain registry-compatible", () => {
  assert.deepEqual(parseSourceUrl("https://docs.google.com/spreadsheets/d/id/edit#gid=1", serviceCatalog), { service: "google-docs", identifier: "id#gid=1", type: "spreadsheet", document_id: "id", sheet_gid: "1" });
  assert.deepEqual(parseSourceUrl("https://docs.google.com/presentation/d/id/edit", serviceCatalog), { service: "google-docs", identifier: "id", type: "presentation" });
  assert.deepEqual(parseSourceUrl("https://docs.google.com/forms/d/id/edit", serviceCatalog), { service: "google-forms", identifier: "id", type: "form" });
  for (const service of serviceCatalog) assert.equal(Object.isFrozen(service), true);
});
