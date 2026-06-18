import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRelationships, formatAsanaTask, gmailMessageBody, markdownFilename, normalizeResource, parseSourceUrl, resourceId, serviceCatalog, slackText, slackTitle, stableJsonCompact, stableJsonPretty } from "../dist/index.js";

const sourceCases = [
  ["https://hub.zoom.us/doc/abc123", { service: "zoom-hub", identifier: "abc123", type: "transcript" }],
  ["https://hub.zoom.us/doc/abc123/", { service: "zoom-hub", identifier: "abc123", type: "transcript" }],
  ["https://www.notion.so/Workspace-0123456789abcdef0123456789abcdef", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://notion.so/0123456789abcdef0123456789abcdef", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://notion.so/01234567-89ab-cdef-0123-456789abcdef", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://notion.so/0123456789ABCDEF0123456789ABCDEF", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://app.notion.com/0123456789abcdef0123456789abcdef", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://workspace.notion.site/Title-0123456789abcdef0123456789abcdef", { service: "notion", identifier: "0123456789abcdef0123456789abcdef", type: "document" }],
  ["https://workspace.slack.com/archives/C123/p1234567890123456", { service: "slack", identifier: "C123:1234567890.123456", type: "message-thread", channel_id: "C123", timestamp: "1234567890.123456", thread_timestamp: "1234567890.123456" }],
  ["https://workspace.slack.com/archives/C123/p1234567890123456/", { service: "slack", identifier: "C123:1234567890.123456", type: "message-thread", channel_id: "C123", timestamp: "1234567890.123456", thread_timestamp: "1234567890.123456" }],
  ["https://workspace.slack.com/archives/C123/p1234567890123456?thread_ts=111.222&cid=C123", { service: "slack", identifier: "C123:111.222", type: "message-thread", channel_id: "C123", timestamp: "1234567890.123456", thread_timestamp: "111.222" }],
  ["https://app.slack.com/client/T123/C123/p1234567890123456", { service: "slack", identifier: "C123:1234567890.123456", type: "message-thread", channel_id: "C123", timestamp: "1234567890.123456", thread_timestamp: "1234567890.123456" }],
  ["https://app.slack.com/client/T123/C123/thread/C123-1234567890.123456", { service: "slack", identifier: "C123:1234567890.123456", type: "message-thread", channel_id: "C123", timestamp: "1234567890.123456", thread_timestamp: "1234567890.123456" }],
  ["https://docs.google.com/document/d/document-id/edit", { service: "google-docs", identifier: "document-id", type: "document" }],
  ["https://docs.google.com/document/u/0/d/document-id/edit", { service: "google-docs", identifier: "document-id", type: "document" }],
  ["https://docs.google.com/document/d/document-id/edit?tab=t.0", { service: "google-docs", identifier: "document-id", type: "document" }],
  ["https://docs.google.com/document/d/document-id/edit?tab=t.abc123", { service: "google-docs", identifier: "document-id#tab=t.abc123", type: "document", document_id: "document-id", document_tab: "t.abc123" }],
  ["https://docs.google.com/document/d/document-id/edit#tab=t.abc123", { service: "google-docs", identifier: "document-id#tab=t.abc123", type: "document", document_id: "document-id", document_tab: "t.abc123" }],
  ["https://docs.google.com/document/d/document-id/edit?resourcekey=doc-key", { service: "google-docs", identifier: "document-id", type: "document", resource_key: "doc-key" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=0", { service: "google-docs", identifier: "sheet-id#gid=0", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "0" }],
  ["https://docs.google.com/spreadsheets/u/0/d/sheet-id/edit#gid=0", { service: "google-docs", identifier: "sheet-id#gid=0", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "0" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=0&range=A1", { service: "google-docs", identifier: "sheet-id#gid=0", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "0" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=9", { service: "google-docs", identifier: "sheet-id#gid=9", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "9" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=9#gid=10&range=A1", { service: "google-docs", identifier: "sheet-id#gid=10", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "10" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit?resourcekey=&gid=9#gid=9", { service: "google-docs", identifier: "sheet-id#gid=9", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "9" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit?resourcekey=sheet-key&gid=9", { service: "google-docs", identifier: "sheet-id#gid=9", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "9", resource_key: "sheet-key" }],
  ["https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=9&resourcekey=sheet-key", { service: "google-docs", identifier: "sheet-id#gid=9", type: "spreadsheet", document_id: "sheet-id", sheet_gid: "9", resource_key: "sheet-key" }],
  ["https://mail.google.com/mail/u/0/#inbox/thread-id", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://mail.google.com/mail/u/0/#all/thread-id", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://mail.google.com/mail/u/0/#search/query/thread-id?projector=1", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://mail.google.com/mail/u/0/#label/customer/thread-id", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://mail.google.com/mail/u/0/#label/customer/sub/thread-id", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://mail.google.com/mail/u/0/#category/promotions/thread-id", { service: "gmail", identifier: "thread-id", type: "email-thread" }],
  ["https://app.asana.com/0/project-id/list", { service: "asana-project", identifier: "project-id", type: "project" }],
  ["https://app.asana.com/0/project-id/board", { service: "asana-project", identifier: "project-id", type: "project" }],
  ["https://app.asana.com/0/project-id/timeline/view-id", { service: "asana-project", identifier: "project-id", type: "project" }],
  ["https://app.asana.com/0/project-id/task/task-id", { service: "asana-task", identifier: "task-id", type: "task" }],
  ["https://app.asana.com/0/project-id/task-id/f", { service: "asana-task", identifier: "task-id", type: "task" }],
  ["https://app.asana.com/0/project-id/task-id", { service: "asana-task", identifier: "task-id", type: "task" }],
  ["https://app.asana.com/1/workspace-id/project/project-id/board", { service: "asana-project", identifier: "project-id", type: "project" }],
  ["https://app.asana.com/1/workspace-id/project/project-id/calendar/view-id", { service: "asana-project", identifier: "project-id", type: "project" }],
  ["https://app.asana.com/1/workspace-id/project/project-id/task/task-id", { service: "asana-task", identifier: "task-id", type: "task" }],
  ["https://app.asana.com/1/workspace-id/task/task-id", { service: "asana-task", identifier: "task-id", type: "task" }],
];

test("parseSourceUrl covers supported URL shapes", () => {
  for (const [url, expected] of sourceCases) {
    const source = parseSourceUrl(url, serviceCatalog);
    assert.deepEqual(source, expected, url);
    assert.equal(Object.isFrozen(source), true);
  }
});

test("parseSourceUrl rejects non-thread Gmail URLs", () => {
  for (const url of ["https://mail.google.com/mail/u/0/#inbox", "https://mail.google.com/mail/u/0/#settings/general", "https://mail.google.com/mail/u/0/#compose/new", "https://mail.google.com/mail/u/0/#label/customer", "https://mail.google.com/mail/u/0/#category/promotions", "https://mail.google.com/mail/u/0/#unknown/thread-id", "https://mail.google.com/mail/u/0/"]) assert.throws(() => parseSourceUrl(url, serviceCatalog), /Unsupported source URL/);
});

test("parseSourceUrl rejects non-task Asana app URLs", () => {
  for (const url of ["https://app.asana.com/0/home", "https://app.asana.com/0/search/123", "https://app.asana.com/0/inbox"]) assert.throws(() => parseSourceUrl(url, serviceCatalog), /Unsupported source URL/);
});

test("Google Sheets tab URLs use distinct resource identities", () => {
  const first = parseSourceUrl("https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=111", serviceCatalog);
  const second = parseSourceUrl("https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=222", serviceCatalog);
  assert.notEqual(resourceId(first), resourceId(second));
  assert.equal(resourceId(first), "google-docs:sheet-id#gid=111");
  assert.equal(resourceId(second), "google-docs:sheet-id#gid=222");
});

test("Google Docs non-default tab URLs use distinct resource identities", () => {
  const defaultTab = parseSourceUrl("https://docs.google.com/document/d/document-id/edit?tab=t.0", serviceCatalog);
  const first = parseSourceUrl("https://docs.google.com/document/d/document-id/edit?tab=t.one", serviceCatalog);
  const second = parseSourceUrl("https://docs.google.com/document/d/document-id/edit?tab=t.two", serviceCatalog);
  assert.notEqual(resourceId(defaultTab), resourceId(first));
  assert.notEqual(resourceId(first), resourceId(second));
  assert.equal(resourceId(defaultTab), "google-docs:document-id");
  assert.equal(resourceId(first), "google-docs:document-id#tab=t.one");
  assert.equal(resourceId(second), "google-docs:document-id#tab=t.two");
});

test("Slack reply permalinks in the same thread share a resource identity", () => {
  const first = parseSourceUrl("https://workspace.slack.com/archives/C123/p1710000000000000?thread_ts=1700000000.000000&cid=C123", serviceCatalog);
  const second = parseSourceUrl("https://workspace.slack.com/archives/C123/p1710000001000000?thread_ts=1700000000.000000&cid=C123", serviceCatalog);
  assert.equal(resourceId(first), "slack:C123:1700000000.000000");
  assert.equal(resourceId(second), "slack:C123:1700000000.000000");
});

test("service catalog and services are immutable", () => {
  assert.equal(Object.isFrozen(serviceCatalog), true);
  for (const service of serviceCatalog) assert.equal(Object.isFrozen(service), true);
});

test("resourceId preserves service and identifier bytes", () => {
  for (const [source, expected] of [
    [{ service: "notion", identifier: "Page-ID", type: "document" }, "notion:Page-ID"],
    [{ service: "gmail", identifier: "", type: "email-thread" }, "gmail:"],
    [{ service: "日本語", identifier: "😀", type: "document" }, "日本語:😀"],
    [{ service: "e\u0301", identifier: "é", type: "document" }, "e\u0301:é"],
    [{ service: "𐐀", identifier: "\ue000", type: "document" }, "𐐀:\ue000"],
  ]) {
    assert.equal(resourceId(source), expected);
  }
});

test("normalizeResource sorts nested resource fields and freezes output", () => {
  const resources = [{
    id: "notion:page", type: "document",
    identifiers: [{ service: "slack", identifier: "z" }, { service: "notion", identifier: "page" }, { service: "slack", identifier: "a" }],
    urls: ["https://z.example", "https://a.example"],
    filesystem_links: [{ path: "z\\document.md", role: "primary", data: { nested: { values: [2, 1] } } }, { path: "a\\asset.png", role: "asset", data: {} }],
    data: [{ namespace: "z", key: "a", value: { nested: [true, null] } }, { namespace: "a", key: "z", value: "value" }],
    relationships: [{ target_id: "b", type: "references", data: { context: ["second"] } }, { target_id: "a", type: "references", data: { context: ["first"] } }, { target_id: "z", type: "contains", data: {} }],
  }, {
    id: "unicode", type: "document", identifiers: [{ service: "😀", identifier: "astral" }, { service: "\ue000", identifier: "private-use" }, { service: "A", identifier: "é" }],
    urls: ["https://😀.example", "https://\ue000.example", "https://a.example"], filesystem_links: [], data: [], relationships: [],
  }];
  const expected = [{
    id: "notion:page", type: "document",
    identifiers: [{ service: "notion", identifier: "page" }, { service: "slack", identifier: "a" }, { service: "slack", identifier: "z" }],
    urls: ["https://a.example", "https://z.example"],
    filesystem_links: [{ path: "a\\asset.png", role: "asset", data: {} }, { path: "z\\document.md", role: "primary", data: { nested: { values: [2, 1] } } }],
    data: [{ namespace: "a", key: "z", value: "value" }, { namespace: "z", key: "a", value: { nested: [true, null] } }],
    relationships: [{ target_id: "z", type: "contains", data: {} }, { target_id: "a", type: "references", data: { context: ["first"] } }, { target_id: "b", type: "references", data: { context: ["second"] } }],
  }, {
    id: "unicode", type: "document",
    identifiers: [{ service: "A", identifier: "é" }, { service: "\ue000", identifier: "private-use" }, { service: "😀", identifier: "astral" }],
    urls: ["https://a.example", "https://\ue000.example", "https://😀.example"], filesystem_links: [], data: [], relationships: [],
  }];
  for (const resource of resources) {
    const normalized = normalizeResource(resource);
    assert.deepEqual(normalized, expected[resources.indexOf(resource)]);
    assert.equal(Object.isFrozen(normalized), true);
    assert.equal(Object.isFrozen(normalized.identifiers), true);
    assert.equal(Object.isFrozen(normalized.filesystem_links), true);
    assert.equal(Object.isFrozen(normalized.data), true);
    assert.equal(Object.isFrozen(normalized.relationships), true);
  }
});

test("stable JSON uses deterministic sorted-key compact and pretty formats", () => {
  for (const [value, compact, pretty] of [
    [{ z: 1, a: { "é": "雪", b: [true, null, "😀"] } }, "{\"a\":{\"b\":[true,null,\"😀\"],\"é\":\"雪\"},\"z\":1}", "{\n  \"a\": {\n    \"b\": [\n      true,\n      null,\n      \"😀\"\n    ],\n    \"é\": \"雪\"\n  },\n  \"z\": 1\n}"],
    [{ "😀": "astral", "\ue000": "private-use", "\u0001": "control", "e\u0301": "decomposed" }, "{\"\\u0001\":\"control\",\"é\":\"decomposed\",\"\":\"private-use\",\"😀\":\"astral\"}", "{\n  \"\\u0001\": \"control\",\n  \"é\": \"decomposed\",\n  \"\": \"private-use\",\n  \"😀\": \"astral\"\n}"],
    [["line\nfeed", { z: 0, A: "quote\"slash/" }], "[\"line\\nfeed\",{\"A\":\"quote\\\"slash/\",\"z\":0}]", "[\n  \"line\\nfeed\",\n  {\n    \"A\": \"quote\\\"slash/\",\n    \"z\": 0\n  }\n]"],
    [[1, 1.5, 0.0001, 0.00001, 0.000001, 1e20, 1e21, 1e-7], "[1,1.5,0.0001,1e-05,1e-06,100000000000000000000,1e+21,1e-07]", "[\n  1,\n  1.5,\n  0.0001,\n  1e-05,\n  1e-06,\n  100000000000000000000,\n  1e+21,\n  1e-07\n]"],
    [{ nested: [{ empty: {} }, [], { values: [false, null, "\u2028"] }] }, "{\"nested\":[{\"empty\":{}},[],{\"values\":[false,null,\" \"]}]}", "{\n  \"nested\": [\n    {\n      \"empty\": {}\n    },\n    [],\n    {\n      \"values\": [\n        false,\n        null,\n        \" \"\n      ]\n    }\n  ]\n}"],
    [{}, "{}", "{}"],
    [[], "[]", "[]"],
  ]) {
    assert.equal(stableJsonCompact(value), compact);
    assert.equal(stableJsonPretty(value), pretty);
  }
});

test("markdownFilename strips filesystem separators and appends markdown extension", () => {
  for (const [title, expected] of [["Document", "document.md"], ['a<b>c:d"e/f\\g|h?i*j', "a-b-c-d-e-f-g-h-i-j.md"], [" Résumé 😀 ", "résumé.md"], ["CON.", "con.md"], ["", "untitled.md"], ["<>", "untitled.md"], [".hidden", "hidden.md"], ["...", "untitled.md"], ["2026-05-21-poe-team-meeting", "2026-05-21-poe-team-meeting.md"]]) assert.equal(markdownFilename(title), expected);
});

test("extractRelationships handles supported URLs, self references, and deduplication", () => {
  const cases = [
    ["# Document\n\nhttps://hub.zoom.us/doc/zoom-id\n", "google-docs:document-id", [{ target_id: "zoom-hub:zoom-id", type: "references", data: { url: "https://hub.zoom.us/doc/zoom-id" } }]],
    ["same https://hub.zoom.us/doc/zoom-id, duplicate https://hub.zoom.us/doc/zoom-id. unsupported https://example.com/x self https://docs.google.com/document/d/document-id/edit", "google-docs:document-id", [{ target_id: "zoom-hub:zoom-id", type: "references", data: { url: "https://hub.zoom.us/doc/zoom-id" } }]],
    ["same target https://hub.zoom.us/doc/zoom-id and alternate https://hub.zoom.us/doc/zoom-id?x=1", "google-docs:document-id", [{ target_id: "zoom-hub:zoom-id", type: "references", data: { url: "https://hub.zoom.us/doc/zoom-id" } }]],
    ["[Slack](https://workspace.slack.com/archives/C123/p1234567890123456)\n", "notion:page", [{ target_id: "slack:C123:1234567890.123456", type: "references", data: { url: "https://workspace.slack.com/archives/C123/p1234567890123456" } }]],
    ["https://hub.zoom.us/doc/zoom-id... https://hub.zoom.us/doc/zoom-id,,,", "notion:page", [{ target_id: "zoom-hub:zoom-id", type: "references", data: { url: "https://hub.zoom.us/doc/zoom-id" } }]],
    ["bad https://% good https://hub.zoom.us/doc/zoom-id", "notion:page", [{ target_id: "zoom-hub:zoom-id", type: "references", data: { url: "https://hub.zoom.us/doc/zoom-id" } }]],
    ['---\nsource: "https://chatgpt.com/c/thread-id"\n---\n', "chatgpt:thread-id", []],
  ];
  for (const [markdown, currentId, expected] of cases) assert.deepEqual(extractRelationships(markdown, currentId, serviceCatalog), expected);
});

test("slackTitle formats date, strips URLs, and preserves readable Unicode", () => {
  const cases = [[[ { ts: "1704067200", text: "Hello world from the first Slack message" } ], "UTC", "2024-01-01-Hello_world_from_the_first_Sla"], [[{ ts: "1704067200", text: "Read https://example.com/path now please" }], "America/Chicago", "2023-12-31-Read_now_please"], [[{ ts: "1704067200", text: "Zażółć gęślą jaźń 😀 -- next" }], "Asia/Tokyo", "2024-01-01-Zażółć_gęślą_jaźń_next"]];
  for (const [messages, timeZone, expected] of cases) assert.equal(slackTitle(messages, timeZone), expected);
});

test("slackText normalizes mentions, channels, links, entities, and code fences", () => {
  const userCache = { U123: "Alice Żółć" };
  for (const [text, expected] of [["hello <@U123>", "hello @Alice Żółć"], ["<#C123|general> <!here> <!subteam^S123|@team>", "#general @here @team"], ["<https://example.com|Example> <https://example.com> <mailto:a@example.com|Email> &amp;", "[Example](https://example.com) https://example.com Email &"], ["before```code```after", "before\n```\ncode\n```\nafter"]]) {
    assert.equal(slackText(text, userCache), expected);
  }
});

test("slackText preserves unknown entities and decodes HTML entities", () => {
  for (const [text, expected] of [["&hellip;", "…"], ["&eacute;", "é"], ["&CounterClockwiseContourIntegral;", "∳"], ["&NotEqualTilde;", "≂̸"], ["&acE;", "∾̳"], ["&copy without semicolon", "© without semicolon"], ["&#128;", "€"], ["&#xD800;", "�"], ["&#xFFFF;", ""], ["&unknown;", "&unknown;"]]) {
    assert.equal(slackText(text, {}), expected, text);
  }
});

test("slackText fails unresolved user mentions", () => {
  assert.throws(() => slackText("hello <@MISSING>", {}));
});

test("gmailMessageBody extracts text from MIME payloads", () => {
  const encode = (value) => Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_");
  const cases = [
    [{ mimeType: "text/plain", body: { data: encode("Plain body 😀") } }, "Plain body 😀"],
    [{ mimeType: "text/html", body: { data: encode("<p>Hello <b>world</b></p><p>Next &amp; last</p>") } }, "Hello\nworld\nNext & last"],
    [{ mimeType: "text/html", body: { data: encode("plain <b>bold</b> tail<div>A&nbsp;B &copy; &#x1F600;</div><script>ignored</script><style>ignored</style>") } }, "plain\nbold\ntail\nA B © 😀"],
    [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: encode("Plain body") } }, { mimeType: "text/html", body: { data: encode("<p>HTML body</p>") } }] }, "Plain body"],
    [{ mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { data: encode("First") } }, { mimeType: "application/octet-stream", body: { data: encode("ignored") } }, { mimeType: "text/html", body: { data: encode("<div>Second</div>") } }] }, "First\nSecond"],
    [{ mimeType: "multipart/related", parts: [{ mimeType: "text/html", body: { data: encode("<div>A<br>B</div><p>C&nbsp;D</p>") } }, { mimeType: "application/octet-stream", body: { data: encode("ignored") } }] }, "A\nB\nC D"],
    [{ mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: encode("plain") } }, { mimeType: "text/html", body: { data: encode("<p>html</p>") } }] }, { mimeType: "text/plain", body: { data: encode("tail") } }] }, "plain\ntail"],
  ];
  for (const [payload, expected] of cases) assert.equal(gmailMessageBody(payload), expected);
});

test("gmailMessageBody rejects base64url without required padding", () => {
  assert.throws(() => gmailMessageBody({ mimeType: "text/plain", body: { data: "YQ" } }), /Incorrect padding/);
});

test("formatAsanaTask renders punctuation and whitespace", () => {
  const cases = [
    [{ name: "Ship rewrite", permalink_url: "https://app.asana.com/0/1/2", completed: false, assignee: null, notes: "Notes" }, [], "# Ship rewrite\n\n- Source: https://app.asana.com/0/1/2\n- Completed: False\n\nNotes\n"],
    [{ name: "Done 😀", permalink_url: "https://app.asana.com/0/1/3", completed: true, assignee: { name: "Alice" }, notes: "Line one\n\nLine two" }, [{ created_at: "2026-06-10T12:00:00Z", created_by: { name: "Bob" }, text: "Changed status" }, { created_at: "2026-06-10T13:00:00Z", created_by: { name: "Éva" }, text: "Added note" }], "# Done 😀\n\n- Source: https://app.asana.com/0/1/3\n- Completed: True\n- Assignee: Alice\n\nLine one\n\nLine two\n\n## Activity\n\n- 2026-06-10T12:00:00Z — Bob: Changed status\n- 2026-06-10T13:00:00Z — Éva: Added note\n"],
  ];
  for (const [taskValue, stories, expected] of cases) assert.equal(formatAsanaTask(taskValue, stories), expected);
});
