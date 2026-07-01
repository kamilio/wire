import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotionCreateOperations,
  diffNotionBlockTrees,
  fetchNotionDocument,
  notionBlockContentHash,
  parseNotionMarkdown,
  renderNotionTreeToMarkdown,
  sidecarBlocksFromNotionTree,
  synchronizeNotionDocument,
} from "../dist/index.js";

let nextId = 1;

function id() {
  const value = String(nextId).padStart(12, "0");
  nextId += 1;
  return `00000000-0000-4000-8000-${value}`;
}

function treeBlock(block) {
  if (block.type === "divider") return { type: "divider", alive: true, content: [] };
  if (block.type === "code") return { type: "code", properties: { title: [[block.content]], language: [[block.properties.language]] }, alive: true, content: [] };
  if (block.type === "to_do") return { type: "to_do", properties: { title: block.rich_text, checked: [[block.properties.checked ? "Yes" : "No"]] }, alive: true, content: [] };
  if (block.type === "image") return { type: "image", properties: { source: [[block.properties.source]], alt_text: [[block.properties.alt_text]], ...(block.properties.caption === undefined ? {} : { caption: block.properties.caption }) }, alive: true, content: [] };
  if (block.type === "table") return { type: "table", properties: {}, format: { table_block_column_order: block.properties.column_ids, table_block_column_header: block.properties.has_header, table_block_row_header: block.properties.has_row_header }, alive: true, content: [] };
  if (block.type === "table_row") return { type: "table_row", properties: block.properties.cells, alive: true, content: [] };
  if (block.type === "callout") return { type: "callout", properties: { title: block.rich_text }, ...(block.properties.format === undefined ? {} : { format: block.properties.format }), alive: true, content: [] };
  if (block.type === "column_list" || block.type === "transclusion_container") return { type: block.type, properties: {}, alive: true, content: [] };
  if (block.type === "column") return { type: "column", properties: {}, ...(block.properties.format === undefined ? {} : { format: block.properties.format }), alive: true, content: [] };
  if (block.type === "toggle") return { type: "text", properties: { title: block.rich_text }, format: { toggleable: true }, alive: true, content: [] };
  return { type: block.type, properties: { title: block.rich_text }, alive: true, content: [] };
}

function remoteTree(markdown, title = "Test page") {
  nextId = 1;
  const roots = [];
  const stack = [{ indent: -1, children: roots, id: "page" }];
  for (const block of parseNotionMarkdown(markdown)) {
    const node = { id: id(), block: treeBlock(block), children: [] };
    while (stack[stack.length - 1].indent >= block.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type)) stack.push({ indent: block.indent, children: node.children, id: node.id });
  }
  return { id: "34e199a9-a61f-8012-acf4-f79101bae370", block: { type: "page", properties: { title: [[title]] }, version: 1, last_edited_time: 1000, alive: true, content: [] }, children: roots };
}

function body(markdown) {
  return markdown.includes("\n\n") ? markdown.slice(markdown.indexOf("\n\n") + 2) : "";
}

function notionRuntime(page, submitted) {
  const blockMap = {};
  const visit = (node) => {
    blockMap[node.id] = { value: { value: { ...node.block, id: node.id, content: node.children.map((child) => child.id), space_id: "space" } } };
    for (const child of node.children) visit(child);
  };
  visit(page);
  return {
    http: { request: async (input, init) => {
      const path = String(input).split("/api/v3/")[1];
      if (path === undefined) return new Response("{}", { headers: { "content-type": "application/json" } });
      const bodyValue = JSON.parse(init.body);
      if (path === "getSpaces") return Response.json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (path === "loadCachedPageChunkV2") return Response.json({ recordMap: { block: blockMap }, cursors: [] });
      if (path === "saveTransactionsFanout") {
        submitted.push(bodyValue.transactions[0].operations);
        return Response.json({ ok: true });
      }
      throw new Error(path);
    } },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    cookies: { load: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], loadSaved: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], metadata: async () => ({}), delete: async () => {} },
  };
}

test("notion parser, renderer, and content hashes cover supported Markdown tooling", () => {
  const cases = [
    "# Heading\n\n## Subheading\n\n### Small heading",
    "plain **bold** *italic* ~~strike~~ `code` [link](https://example.com)",
    "- bullet\n  - nested",
    "1. one\n2. two",
    "- [x] done\n- [ ] todo",
    "> quoted **text**",
    "> parent\n  nested child",
    "```Ruby\nputs(1)\n```",
    "---",
    "![diagram](https://example.com/diagram.png)",
    ":::to-do\n:::checked true\n\n  Details\n:::",
    ":::callout\n**Careful**\n  child paragraph\n:::",
    ":::toggle\n*Details*\n  - child item\n:::",
    ":::equation\nE=mc^2\n:::",
    ":::page\nChild page\n  child paragraph\n:::",
    ":::columns\n  :::column\n  0.5\n    Left\n  :::\n  :::column\n    Right\n  :::\n:::",
    ":::synced\n  Synced child\n:::",
    "| Name | Status |\n|---|---|\n| **Alpha** | [ready](https://example.com) |",
  ];
  for (const markdown of cases) {
    const tree = remoteTree(markdown);
    const rendered = renderNotionTreeToMarkdown(tree);
    const reparsed = remoteTree(body(rendered));
    assert.deepEqual(
      sidecarBlocksFromNotionTree(reparsed).map((block) => [block.path, block.type, block.hash]),
      sidecarBlocksFromNotionTree(tree).map((block) => [block.path, block.type, block.hash]),
      markdown,
    );
  }
  const boldFirst = { type: "text", properties: { title: [["Scope: ", [["b"]]], ["body"]] } };
  const boldSecond = parseNotionMarkdown("**Scope:** body")[0];
  assert.equal(notionBlockContentHash(boldFirst), notionBlockContentHash(boldSecond));
});

test("notion renderer omits missing column ratios", () => {
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "columns", block: { type: "column_list" }, children: [
      { id: "column", block: { type: "column", format: {} }, children: [
        { id: "text", block: { type: "text", properties: { title: [["Inside"]] } }, children: [] },
      ] },
    ] },
  ] });
  assert.equal(markdown.includes("undefined"), false);
  assert.match(markdown, /Inside/);
});

test("notion empty text blocks round-trip without deletion", () => {
  const remote = { id: "page", block: { type: "page", properties: { title: [["Root"]] }, alive: true }, children: [
    { id: "empty", block: { type: "text", properties: { title: [] }, alive: true }, children: [] },
    { id: "after", block: { type: "text", properties: { title: [["After"]] }, alive: true }, children: [] },
  ] };
  const markdown = renderNotionTreeToMarkdown(remote);
  const local = parseNotionMarkdown(body(markdown));
  assert.match(markdown, /:::text\n:::/);
  assert.deepEqual(local.map((block) => [block.type, block.content]), [["text", ""], ["text", "After"]]);
  assert.deepEqual(diffNotionBlockTrees(remote, local, sidecarBlocksFromNotionTree(remote), { spaceId: "space", userId: "user", currentTime: 1700000000000 }), { operations: [], summary: { inserted: 0, updated: 0, deleted: 0, moved: 0 } });
});

test("notion multiline list titles round-trip without child text splits", () => {
  const bullet = { type: "bulleted_list", properties: { title: [["line one\nline two"]] } };
  const numbered = { type: "numbered_list", properties: { title: [["one\ntwo"]] } };
  const todo = { type: "to_do", properties: { title: [["task\ndetail"]], checked: [["Yes"]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "bullet", block: bullet, children: [] },
    { id: "numbered", block: numbered, children: [] },
    { id: "todo", block: todo, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown));
  assert.deepEqual(parsed.map((block) => [block.type, block.content, block.indent]), [
    ["bulleted_list", "line one\nline two", 0],
    ["numbered_list", "one\ntwo", 0],
    ["to_do", "task\ndetail", 0],
  ]);
  assert.equal(notionBlockContentHash(bullet), notionBlockContentHash(parsed[0]));
  assert.equal(notionBlockContentHash(numbered), notionBlockContentHash(parsed[1]));
  assert.equal(notionBlockContentHash(todo), notionBlockContentHash(parsed[2]));
});

test("notion nested text under lists round-trips as a child block", () => {
  const remote = { id: "page", block: { type: "page", properties: { title: [["Root"]] }, alive: true }, children: [
    { id: "bullet", block: { type: "bulleted_list", properties: { title: [["Parent"]] }, alive: true }, children: [
      { id: "child", block: { type: "text", properties: { title: [["Child text"]] }, alive: true }, children: [] },
    ] },
  ] };
  const markdown = renderNotionTreeToMarkdown(remote);
  const reparsed = remoteTree(body(markdown), "Root");
  assert.match(markdown, /  :::text\n  Child text\n  :::/);
  assert.deepEqual(
    sidecarBlocksFromNotionTree(reparsed).map((block) => [block.path, block.type, block.hash]),
    sidecarBlocksFromNotionTree(remote).map((block) => [block.path, block.type, block.hash]),
  );
});

test("notion opaque fallback blocks round-trip without text conversion", () => {
  const remote = { id: "page", block: { type: "page", properties: { title: [["Root"]] }, alive: true }, children: [
    { id: "bookmark", block: { type: "bookmark", properties: { title: [["Link"]], link: [["https://example.com"]] }, alive: true }, children: [] },
    { id: "database", block: { type: "collection_view", format: { collection_pointer: { id: "collection", spaceId: "space" } }, alive: true }, children: [] },
  ] };
  const markdown = renderNotionTreeToMarkdown(remote);
  const local = parseNotionMarkdown(body(markdown));
  assert.equal(markdown.includes(":::notion-opaque"), true);
  assert.equal(markdown.includes(":::notion-format"), true);
  assert.deepEqual(local.map((block) => block.type), ["bookmark", "collection_view"]);
  assert.deepEqual(diffNotionBlockTrees(remote, local, sidecarBlocksFromNotionTree(remote), { spaceId: "space", userId: "user", currentTime: 1700000000000 }), { operations: [], summary: { inserted: 0, updated: 0, deleted: 0, moved: 0 } });
});

test("notion parser ignores one-column table separators", () => {
  const blocks = parseNotionMarkdown("| only cell |\n| --- |");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "table");
  assert.equal(blocks[1].type, "table_row");
  assert.deepEqual(Object.keys(blocks[1].properties.cells), ["column_0"]);
});

test("notion table cells preserve literal br tags", () => {
  const columns = ["column_0", "column_1"];
  const row = { id: "row", block: { type: "table_row", properties: { column_0: [["literal <br> tag"]], column_1: [["B"]] } }, children: [] };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "table", block: { type: "table", format: { table_block_column_order: columns, table_block_column_header: true, table_block_row_header: false } }, children: [row] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[1];
  assert.equal(markdown.includes("\\<br>"), true);
  assert.equal(notionBlockContentHash(row.block, columns), notionBlockContentHash(parsed, columns));
});

test("notion code blocks preserve meaningful indentation", () => {
  const block = { type: "code", properties: { title: [["def f():\n    return 1"]], language: [["Python"]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "code", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion table header settings do not create Markdown-only sync updates", () => {
  const columns = ["column_0", "column_1"];
  const remote = { id: "page", block: { type: "page", properties: { title: [["Root"]] }, alive: true }, children: [
    { id: "table", block: { type: "table", format: { table_block_column_order: columns, table_block_column_header: false, table_block_row_header: true }, alive: true }, children: [
      { id: "row", block: { type: "table_row", properties: { column_0: [["A"]], column_1: [["B"]] }, alive: true }, children: [] },
    ] },
  ] };
  const local = parseNotionMarkdown(body(renderNotionTreeToMarkdown(remote)));
  assert.deepEqual(diffNotionBlockTrees(remote, local, sidecarBlocksFromNotionTree(remote), { spaceId: "space", userId: "user", currentTime: 1700000000000 }), { operations: [], summary: { inserted: 0, updated: 0, deleted: 0, moved: 0 } });
});

test("notion table rows map local positional cells onto remote column ids", () => {
  const columns = ["first-random", "second-random"];
  const remote = { id: "page", block: { type: "page", properties: { title: [["Root"]] }, alive: true }, children: [
    { id: "table", block: { type: "table", format: { table_block_column_order: columns, table_block_column_header: true, table_block_row_header: false }, alive: true }, children: [
      { id: "row", block: { type: "table_row", properties: { "first-random": [["A"]], "second-random": [["B"]] }, alive: true }, children: [] },
    ] },
  ] };
  const local = parseNotionMarkdown(body(renderNotionTreeToMarkdown(remote)).replace("| A | B |", "| A | C |"));
  const diff = diffNotionBlockTrees(remote, local, sidecarBlocksFromNotionTree(remote), { spaceId: "space", userId: "user", currentTime: 1700000000000 });
  assert.deepEqual(diff.summary, { inserted: 0, updated: 1, deleted: 0, moved: 0 });
  assert.deepEqual(diff.operations.filter((operation) => operation.path[0] === "properties"), [
    { pointer: { table: "block", id: "row", spaceId: "space" }, path: ["properties", "second-random"], command: "set", args: [["C"]] },
  ]);
});

test("notion links preserve urls containing parentheses", () => {
  const block = { type: "text", properties: { title: [["spec", [["a", "https://example.com/a(b)"]]]] } };
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parseNotionMarkdown("[spec](https://example.com/a(b))")[0]));
});

test("notion images preserve bracketed alt text", () => {
  const block = { type: "image", properties: { alt_text: [["diagram [v2]"]], source: [["https://example.com/a.png"]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "image", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion linked text preserves nested marks", () => {
  const block = { type: "text", properties: { title: [["Important", [["a", "https://example.com"], ["b"]]]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "text", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion formatted text preserves delimiter characters", () => {
  const block = { type: "text", properties: { title: [["a*b", [["b"]]]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "text", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion plain text parses as a single rich-text segment", () => {
  const block = parseNotionMarkdown("plain replacement")[0];
  assert.deepEqual(block.rich_text, [["plain replacement"]]);
});

test("notion plain text preserves literal Markdown syntax", () => {
  const block = { type: "text", properties: { title: [["**not bold**"]] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "text", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion semantic spans preserve date mention and equation marks", () => {
  const block = { type: "text", properties: { title: [
    ["Today", [["d", { type: "date", start_date: "2026-06-16" }]]],
    [" page", [["p", "page-id", "space-id"]]],
    [" x^2", [["e", "x^2"]]],
    [" user", [["u", "user-id"]]],
  ] } };
  const markdown = renderNotionTreeToMarkdown({ id: "page", block: { type: "page", properties: { title: [["Root"]] } }, children: [
    { id: "text", block, children: [] },
  ] });
  const parsed = parseNotionMarkdown(body(markdown))[0];
  assert.equal(notionBlockContentHash(block), notionBlockContentHash(parsed));
});

test("notion parser preserves mention spans nested inside bold markdown", () => {
  const block = parseNotionMarkdown('**Owner** **<span data-notion-mention="u" data-notion-id="user-id">‣</span>**')[0];
  assert.deepEqual(block.rich_text, [
    ["Owner", [["b"]]],
    [" "],
    ["‣", [["b"], ["u", "user-id"]]],
  ]);
});

test("notion create operations reject orphan-indented Markdown", () => {
  assert.throws(
    () => buildNotionCreateOperations(parseNotionMarkdown("  Orphan child"), "page-id", "space", "user", 1700000000000, () => id()),
    /Indented Notion Markdown block has no parent at indent 0/,
  );
});

test("notion diff operations preserve stable ids for local edits", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("first\n\nsecond\n\nthird\n");
  assert.deepEqual(diffNotionBlockTrees(base, parseNotionMarkdown("first\n\nsecond\n\nthird\n"), sidecarBlocksFromNotionTree(base), ambient), { operations: [], summary: { inserted: 0, updated: 0, deleted: 0, moved: 0 } });
  const updated = diffNotionBlockTrees(base, parseNotionMarkdown("first\n\nedited second\n\nthird\n"), sidecarBlocksFromNotionTree(base), ambient);
  assert.equal(updated.summary.updated, 1);
  assert.equal(updated.operations.filter((operation) => operation.command === "set" && operation.path.join("/") === "properties/title")[0].pointer.id, base.children[1].id);
  const inserted = diffNotionBlockTrees(base, parseNotionMarkdown("first\n\nsecond\n\nnew\n\nthird\n"), sidecarBlocksFromNotionTree(base), ambient);
  assert.equal(inserted.summary.inserted, 1);
  assert.equal(inserted.operations.some((operation) => operation.command === "listAfter" && operation.args.after === base.children[1].id), true);
  const todoBase = remoteTree("- [ ] task\n");
  const checked = diffNotionBlockTrees(todoBase, parseNotionMarkdown("- [x] task\n"), sidecarBlocksFromNotionTree(todoBase), ambient);
  assert.deepEqual(checked.operations.filter((operation) => operation.path.join("/") === "properties/checked")[0].args, [["Yes"]]);
});

test("notion diff creates every block in inserted nested subtrees", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("first\n\nthird");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("first\n\n- parent\n  - child\n\nthird"), sidecarBlocksFromNotionTree(base), ambient);
  const created = result.operations.filter((operation) => operation.command === "set" && operation.path.length === 0);
  assert.deepEqual(result.summary, { inserted: 2, updated: 0, deleted: 0, moved: 0 });
  assert.deepEqual(created.map((operation) => operation.args.type), ["bulleted_list", "bulleted_list"]);
  assert.equal(created[1].args.parent_id, created[0].args.id);
});

test("notion diff updates child blocks under unchanged parents", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("- Parent\n  :::text\n  Old child\n  :::");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("- Parent\n  :::text\n  New child\n  :::"), sidecarBlocksFromNotionTree(base), ambient);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.operations.some((operation) => operation.pointer.id === base.children[0].children[0].id && operation.path.join("/") === "properties/title"), true);
});

test("notion diff updates child blocks under changed parents", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("- Old parent\n  :::text\n  Old child\n  :::");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("- New parent\n  :::text\n  New child\n  :::"), sidecarBlocksFromNotionTree(base), ambient);
  assert.equal(result.summary.updated, 2);
  assert.equal(result.operations.some((operation) => operation.pointer.id === base.children[0].id && operation.path.join("/") === "properties/title"), true);
  assert.equal(result.operations.some((operation) => operation.pointer.id === base.children[0].children[0].id && operation.path.join("/") === "properties/title"), true);
});

test("notion diff clears stale format when converting toggles to text", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree(":::toggle\nDetails\n:::");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("Details"), sidecarBlocksFromNotionTree(base), ambient);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.operations.some((operation) => operation.pointer.id === base.children[0].id && operation.path.join("/") === "format" && JSON.stringify(operation.args) === "{}"), true);
});

test("notion diff replaces stale properties when changing block types", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("![old](https://example.com/old.png)");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("plain replacement"), sidecarBlocksFromNotionTree(base), ambient);
  const properties = result.operations.find((operation) => operation.pointer.id === base.children[0].id && operation.path.join("/") === "properties");
  assert.equal(result.summary.updated, 1);
  assert.deepEqual(properties.args, { title: [["plain replacement"]] });
});

test("notion diff reorders existing siblings without recreating blocks", () => {
  const ambient = { spaceId: "space", userId: "user", currentTime: 1700000000000 };
  const base = remoteTree("first\n\nsecond");
  const result = diffNotionBlockTrees(base, parseNotionMarkdown("second\n\nfirst"), sidecarBlocksFromNotionTree(base), ambient);
  assert.deepEqual(result.summary, { inserted: 0, updated: 0, deleted: 0, moved: 1 });
  assert.equal(result.operations.some((operation) => operation.command === "set" && operation.path.length === 0), false);
  assert.equal(result.operations.some((operation) => operation.path.join("/") === "alive"), false);
  assert.equal(result.operations.some((operation) => operation.command === "listBefore" && operation.args.id === base.children[1].id), true);
});

test("notion create operations parent nested blocks and preserve metadata", () => {
  const blocks = parseNotionMarkdown(":::callout\nCareful\n  - child item\n:::\n\n![Diagram](https://example.com/diagram.png)");
  const { operations, topLevelIds } = buildNotionCreateOperations(blocks, "page-id", "space", "user", 1700000000000, () => id());
  const sets = operations.filter((operation) => operation.command === "set" && operation.path.length === 0);
  assert.equal(topLevelIds.length, 2);
  assert.deepEqual(sets.map((operation) => operation.args.type), ["callout", "bulleted_list", "image"]);
  assert.equal(sets[1].args.parent_id, topLevelIds[0]);
  assert.deepEqual(sets[2].args.properties.source, [["https://example.com/diagram.png"]]);
  assert.equal(sets[0].args.created_time, 1700000000000);
  assert.equal(sets[0].args.last_edited_by_id, "user");
});

test("notion document synchronization runs in TypeScript without process delegation", async () => {
  const page = remoteTree("Old body\n", "Old title");
  const submitted = [];
  const blockMap = {
    [page.id]: { value: { value: { ...page.block, id: page.id, content: page.children.map((child) => child.id), space_id: "space" } } },
    ...Object.fromEntries(page.children.map((child) => [child.id, { value: { value: { ...child.block, id: child.id, content: child.children.map((grandchild) => grandchild.id), space_id: "space" } } }])),
  };
  const runtime = {
    http: { request: async (input, init = {}) => {
      const path = String(input).split("/api/v3/")[1];
      if (path === undefined) return new Response("{}", { headers: { "content-type": "application/json" } });
      const body = init.body === undefined ? {} : JSON.parse(init.body);
      if (path === "getSpaces") return Response.json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (path === "loadCachedPageChunkV2") return Response.json({ recordMap: { block: blockMap }, cursors: [] });
      if (path === "saveTransactionsFanout") {
        submitted.push(body.transactions[0].operations);
        return Response.json({ ok: true });
      }
      throw new Error(path);
    } },
    filesystem: { exists: async () => true, readText: async () => "# New title\n\nNew body\n", writeText: async () => {}, delete: async () => {} },
    process: { execute: async () => { throw new Error("process delegation is forbidden"); } },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    openFiles: { open: async () => {} },
    configuration: { get: (name) => ({ HOME: "/home" })[name] },
    secrets: { get: async () => "" },
    cookies: { load: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], loadSaved: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], metadata: async () => ({}), delete: async () => {} },
    gmailTokens: { load: async () => ({}), refresh: async () => ({}) },
  };
  const result = await synchronizeNotionDocument(runtime, "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { page_id: page.id, blocks: sidecarBlocksFromNotionTree(page), markdown: "# Old title\n\nOld body" }, "# New title\n\nNew body\n", "/workspace/page.md");
  assert.equal(result.title, "New title");
  assert.equal(result.markdown, "# New title\n\nNew body");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].some((operation) => operation.path.join("/") === "properties/title"), true);
  assert.equal(submitted[0].some((operation) => operation.path.join("/") === "properties/title" && operation.pointer.id === page.children[0].id), true);
  assert.equal(result.data.page_id, page.id);
  assert.deepEqual(result.data.blocks.map((block) => block.type), ["page", "text"]);
});

test("notion synchronization preserves remote title when local Markdown omits H1", async () => {
  const page = remoteTree("Old body\n", "Remote title");
  const submitted = [];
  const blockMap = {
    [page.id]: { value: { value: { ...page.block, id: page.id, content: page.children.map((child) => child.id), space_id: "space" } } },
    ...Object.fromEntries(page.children.map((child) => [child.id, { value: { value: { ...child.block, id: child.id, content: child.children.map((grandchild) => grandchild.id), space_id: "space" } } }])),
  };
  const runtime = {
    http: { request: async (input, init = {}) => {
      const path = String(input).split("/api/v3/")[1];
      if (path === undefined) return new Response("{}", { headers: { "content-type": "application/json" } });
      const bodyValue = init.body === undefined ? {} : JSON.parse(init.body);
      if (path === "getSpaces") return Response.json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (path === "loadCachedPageChunkV2") return Response.json({ recordMap: { block: blockMap }, cursors: [] });
      if (path === "saveTransactionsFanout") {
        submitted.push(bodyValue.transactions[0].operations);
        return Response.json({ ok: true });
      }
      throw new Error(path);
    } },
    filesystem: { exists: async () => true, readText: async () => "New body\n", writeText: async () => {}, delete: async () => {} },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    cookies: { load: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], loadSaved: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], metadata: async () => ({}), delete: async () => {} },
  };
  const result = await synchronizeNotionDocument(runtime, "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { page_id: page.id, blocks: sidecarBlocksFromNotionTree(page), markdown: "# Remote title\n\nOld body" }, "New body\n", "/workspace/page.md");
  assert.equal(result.title, "Remote title");
  assert.equal(result.markdown, "# Remote title\n\nNew body");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.id && operation.path.join("/") === "properties/title"), false);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.children[0].id && operation.path.join("/") === "properties/title"), true);
});

test("notion synchronization merges remote title with local body edits", async () => {
  const page = remoteTree("Old body\n", "Remote title");
  const submitted = [];
  const result = await synchronizeNotionDocument(notionRuntime(page, submitted), "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { markdown: "# Old title\n\nOld body" }, "# Old title\n\nNew body", "/workspace/page.md");
  assert.equal(result.title, "Remote title");
  assert.equal(result.markdown, "# Remote title\n\nNew body");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.id && operation.path.join("/") === "properties/title"), false);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.children[0].id && operation.path.join("/") === "properties/title"), true);
});

test("notion synchronization merges local title with remote body edits", async () => {
  const page = remoteTree("Remote body\n", "Old title");
  const submitted = [];
  const result = await synchronizeNotionDocument(notionRuntime(page, submitted), "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { markdown: "# Old title\n\nOld body" }, "# Local title\n\nOld body", "/workspace/page.md");
  assert.equal(result.title, "Local title");
  assert.equal(result.markdown, "# Local title\n\nRemote body");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.id && operation.path.join("/") === "properties/title"), true);
  assert.equal(submitted[0].some((operation) => operation.pointer.id === page.children[0].id && operation.path.join("/") === "properties/title"), false);
});

test("notion synchronization hydrates stored user mention handles", async () => {
  const page = remoteTree("- **Owner** @owner\n", "Root");
  const submitted = [];
  const result = await synchronizeNotionDocument(
    notionRuntime(page, submitted),
    "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370",
    { markdown: "# Root\n\n- **Owner** @owner", user_mentions: { "user-id": "owner" } },
    "# Root\n\n- **Owner** @owner",
    "/workspace/page.md",
  );
  assert.equal(result.markdown, "# Root\n\n- **Owner** @owner");
  assert.deepEqual(result.data.user_mentions, { "user-id": "owner" });
  assert.equal(submitted.length, 1);
  const titleUpdate = submitted[0].find((operation) => operation.path.join("/") === "properties/title" && operation.pointer.id === page.children[0].id);
  assert.deepEqual(titleUpdate.args, [["Owner", [["b"]]], [" "], ["‣", [["u", "user-id"]]]]);
});

test("notion synchronization updates title without parsing unchanged opaque body", async () => {
  const pageId = "34e199a9-a61f-8012-acf4-f79101bae370";
  const tree = {
    id: pageId,
    block: { id: pageId, type: "page", properties: { title: [["Old"]] }, alive: true, content: ["database"] },
    children: [{ id: "database", block: { id: "database", type: "collection_view", alive: true, format: { collection_pointer: { id: "collection", spaceId: "space" } } }, children: [] }],
  };
  const submitted = [];
  const blockMap = {
    [pageId]: { value: { value: { ...tree.block, space_id: "space" } } },
    database: { value: { value: { ...tree.children[0].block, space_id: "space" } } },
  };
  const runtime = {
    http: { request: async (input, init = {}) => {
      const path = String(input).split("/api/v3/")[1];
      if (path === undefined) return new Response("{}", { headers: { "content-type": "application/json" } });
      const bodyValue = init.body === undefined ? {} : JSON.parse(init.body);
      if (path === "getSpaces") return Response.json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (path === "loadCachedPageChunkV2") return Response.json({ recordMap: { block: blockMap }, cursors: [] });
      if (path === "saveTransactionsFanout") {
        submitted.push(bodyValue.transactions[0].operations);
        return Response.json({ ok: true });
      }
      throw new Error(path);
    } },
    filesystem: { exists: async () => true, readText: async () => "", writeText: async () => {}, delete: async () => {} },
    process: { execute: async () => { throw new Error("process delegation is forbidden"); } },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    openFiles: { open: async () => {} },
    configuration: { get: (name) => ({ HOME: "/home" })[name] },
    secrets: { get: async () => "" },
    cookies: { load: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], loadSaved: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], metadata: async () => ({}), delete: async () => {} },
    gmailTokens: { load: async () => ({}), refresh: async () => ({}) },
  };
  const baseDocument = await fetchNotionDocument(runtime, "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { service: "notion", identifier: pageId, type: "document" });
  const result = await synchronizeNotionDocument(runtime, "https://www.notion.so/Page-34e199a9a61f8012acf4f79101bae370", { markdown: baseDocument.markdown }, baseDocument.markdown.replace("# Old", "# New"), "/workspace/page.md");
  assert.equal(result.title, "New");
  assert.equal(result.markdown.includes(":::notion-opaque"), true);
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0].map((operation) => operation.path.join("/")), ["properties/title", "last_edited_time"]);
});
