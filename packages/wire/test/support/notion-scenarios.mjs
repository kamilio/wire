import assert from "node:assert/strict";

import {
  diffNotionBlockTrees,
  parseNotionMarkdown,
  renderNotionTreeToMarkdown,
  sidecarBlocksFromNotionTree,
  synchronizeNotionDocument,
} from "../../dist/index.js";

let nextId = 1;

export function notionScenarioId() {
  const value = String(nextId).padStart(12, "0");
  nextId += 1;
  return `00000000-0000-4000-8000-${value}`;
}

export function resetNotionScenarioIds() {
  nextId = 1;
}

function treeBlock(block) {
  if (block.type === "divider") return { type: "divider", alive: true, content: [] };
  if (block.type === "code") return { type: "code", properties: { title: [[block.content]], language: [[block.properties.language]] }, alive: true, content: [] };
  if (block.type === "to_do") return { type: "to_do", properties: { title: block.rich_text, checked: [[block.properties.checked ? "Yes" : "No"]] }, alive: true, content: [] };
  if (block.type === "image") return { type: "image", properties: { source: [[block.properties.source]], alt_text: [[block.properties.alt_text]], ...(block.properties.caption === undefined ? {} : { caption: block.properties.caption }) }, alive: true, content: [] };
  if (block.type === "table") return { type: "table", properties: {}, format: { table_block_column_order: block.properties.column_ids, table_block_column_header: block.properties.has_header, table_block_row_header: block.properties.has_row_header }, alive: true, content: [] };
  if (block.type === "table_row") return { type: "table_row", properties: block.properties.cells, alive: true, content: [] };
  if (block.type === "callout") return { type: "callout", properties: { title: block.rich_text }, ...(block.properties.format === undefined ? {} : { format: block.properties.format }), alive: true, content: [] };
  if (block.type === "toggle") return { type: "text", properties: { title: block.rich_text }, format: { toggleable: true }, alive: true, content: [] };
  if (["header", "sub_header", "sub_sub_header"].includes(block.type)) return { type: block.type, properties: { title: block.rich_text }, ...(block.properties.format === undefined ? {} : { format: block.properties.format }), alive: true, content: [] };
  return { type: block.type, properties: { title: block.rich_text }, alive: true, content: [] };
}

export function notionTreeFromMarkdown(markdown, title = "Scenario") {
  resetNotionScenarioIds();
  const roots = [];
  const stack = [{ indent: -1, children: roots }];
  for (const block of parseNotionMarkdown(markdown)) {
    const node = { id: notionScenarioId(), block: treeBlock(block), children: [] };
    while (stack[stack.length - 1].indent >= block.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    if (["bulleted_list", "numbered_list", "to_do", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table"].includes(block.type)) stack.push({ indent: block.indent, children: node.children });
  }
  return { id: "34e199a9-a61f-8012-acf4-f79101bae370", block: { id: "34e199a9-a61f-8012-acf4-f79101bae370", type: "page", properties: { title: [[title]] }, version: 1, last_edited_time: 1000, alive: true, content: [] }, children: roots };
}

export function bodyMarkdown(markdown) {
  return markdown.includes("\n\n") ? markdown.slice(markdown.indexOf("\n\n") + 2) : "";
}

function blockRecords(tree) {
  const records = {};
  const walk = (node) => {
    records[node.id] = { ...node.block, id: node.id, content: node.children.map((child) => child.id), space_id: "space" };
    for (const child of node.children) walk(child);
  };
  walk(tree);
  return records;
}

export function createNotionScenarioRuntime(tree) {
  const submitted = [];
  const records = blockRecords(tree);
  const runtime = {
    http: { request: async (input, init = {}) => {
      const path = String(input).split("/api/v3/")[1];
      if (path === undefined) return Response.json({});
      const payload = init.body === undefined ? {} : JSON.parse(init.body);
      if (path === "getSpaces") return Response.json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (path === "loadCachedPageChunkV2") return Response.json({ recordMap: { block: Object.fromEntries(Object.entries(records).map(([id, value]) => [id, { value: { value } }])) }, cursors: [] });
      if (path === "saveTransactionsFanout") {
        submitted.push(payload.transactions[0].operations);
        return Response.json({ ok: true });
      }
      throw new Error(path);
    } },
    filesystem: { exists: async () => true, readText: async () => "", writeText: async () => {}, delete: async () => {} },
    process: { execute: async () => { throw new Error("process execution is forbidden"); } },
    clock: { now: () => new Date("2026-06-15T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    openFiles: { open: async () => {} },
    configuration: { get: (name) => ({ HOME: "/home" })[name] },
    secrets: { get: async () => "" },
    cookies: { load: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], loadSaved: async () => [{ name: "notion_user_id", value: "user" }, { name: "token_v2", value: "token" }], metadata: async () => ({}), delete: async () => {} },
    gmailTokens: { load: async () => ({}), refresh: async () => ({}) },
  };
  return { runtime, submitted };
}

export function assertRoundTripScenario(scenario) {
  const tree = notionTreeFromMarkdown(scenario.markdown);
  const rendered = renderNotionTreeToMarkdown(tree);
  const reparsed = notionTreeFromMarkdown(bodyMarkdown(rendered));
  assert.deepEqual(
    sidecarBlocksFromNotionTree(reparsed).map((block) => [block.path, block.type, block.hash]),
    sidecarBlocksFromNotionTree(tree).map((block) => [block.path, block.type, block.hash]),
  );
}

export function assertDiffScenario(scenario) {
  const remote = notionTreeFromMarkdown(scenario.remote);
  const result = diffNotionBlockTrees(remote, parseNotionMarkdown(scenario.local), sidecarBlocksFromNotionTree(remote), { spaceId: "space", userId: "user", currentTime: 1781524800000 });
  assert.deepEqual(result.summary, scenario.summary);
  for (const command of scenario.commands) assert.equal(result.operations.some((operation) => operation.command === command), true);
}

export async function assertSyncScenario(scenario) {
  const remote = notionTreeFromMarkdown(bodyMarkdown(scenario.remote), scenario.remote.split("\n")[0].replace(/^# /, ""));
  const { runtime, submitted } = createNotionScenarioRuntime(remote);
  if (scenario.throws === true) {
    await assert.rejects(synchronizeNotionDocument(runtime, "https://app.notion.com/p/quora/Test-page-34e199a9a61f8012acf4f79101bae370", { markdown: scenario.base }, scenario.local, "/workspace/page.md"));
    assert.equal(submitted.length, 0);
    return;
  }
  const result = await synchronizeNotionDocument(runtime, "https://app.notion.com/p/quora/Test-page-34e199a9a61f8012acf4f79101bae370", { markdown: scenario.base }, scenario.local, "/workspace/page.md");
  assert.equal(result.markdown, scenario.expectedMarkdown);
  assert.equal(submitted.length, scenario.writes);
}

const textScenarios = [
  "plain paragraph",
  "line one\nline two",
  " leading text trimmed by parser",
  "emoji 😀 snow 雪",
  "accented Zażółć gęślą jaźń",
  "symbols ! @ # $ % ^ & ( )",
  "colon: semicolon; comma, period.",
  "tabs\tstay in text",
  "hard break first\nsecond\nthird",
  "private use \uE000 and astral 𐐀",
];

const inlineScenarios = [
  "**bold** body",
  "*italic* body",
  "~~strike~~ body",
  "`code` body",
  "[link](https://example.com/path)",
  "<u>underline</u>",
  "<span data-notion-color=\"red_background\">red</span>",
  "prefix **bold** suffix",
  "prefix *italic* suffix",
  "prefix `tick` suffix",
];

const headingScenarios = [
  "# Heading",
  "## Subheading",
  "### Small heading",
  "# Heading\n\nBody",
  "## Toggle {toggle}\n  child",
  "### Deep toggle {toggle}\n  child",
];

const listScenarios = [
  "- bullet",
  "- first\n- second",
  "- parent\n  - child",
  "- parent\n  - child\n    - grandchild",
  "1. one",
  "1. one\n2. two",
  "1. parent\n  1. child",
  "- [ ] todo",
  "- [x] done",
  "- [ ] parent\n  - child",
  "- [x] parent\n  - [ ] child",
  "- multiline\n  continuation",
];

const mediaScenarios = [
  "> quote",
  "> quoted **text**",
  "---",
  "```JavaScript\nconsole.log(1)\n```",
  "````JavaScript\nconst ticks = ```;\n````",
  "![diagram](https://example.com/diagram.png)",
  "![space alt](https://example.com/a%20b.png)",
  "plain\n\n---\n\nnext",
  "> quote\n\nBody",
  "```Ruby\nputs 1\n```",
];

const tableScenarios = [
  "| A | B |\n|---|---|\n| 1 | 2 |",
  "| Name | Status |\n|---|---|\n| Alpha | Ready |",
  "| Name | Status |\n|---|---|\n| **Alpha** | [ready](https://example.com) |",
  "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |",
  "| Empty | Value |\n|---|---|\n|  | x |",
  "| Emoji | Value |\n|---|---|\n| 😀 | 雪 |",
  "| Code | Value |\n|---|---|\n| `x` | y |",
  "| Link | Value |\n|---|---|\n| [x](https://example.com/x) | y |",
  "| A | B |\n|---|---|\n| gamma | ~~pipe \\| value~~ |",
  "| A | B |\n|---|---|\n| backslash \\\\ value | <span data-notion-color=\"blue_background\">link [x](https://example.com/a)</span> |",
];

const containerScenarios = [
  ":::callout\nCareful\n  child paragraph\n:::",
  ":::callout\n**Careful**\n  - child item\n:::",
  ":::toggle\nDetails\n  hidden paragraph\n:::",
  ":::toggle\nDetails\n  - hidden item\n:::",
  ":::callout\nParent\n  - child\n    - grandchild\n:::",
  ":::toggle\nParent\n  - [x] child\n:::",
  "- list\n  :::toggle\n  Nested\n    child\n  :::",
  "- list\n  :::callout\n  Nested\n    child\n  :::",
  ":::callout\nUnicode 😀\n  Zażółć\n:::",
  ":::toggle\nInline **bold**\n  child `code`\n:::",
];

const spacingScenarios = [
  "first\n\nsecond",
  "\n\nfirst\n\n",
  "first  ",
  "first\n\n- bullet\n\nsecond",
];

export const notionRoundTripScenarios = [...textScenarios, ...inlineScenarios, ...headingScenarios, ...listScenarios, ...mediaScenarios, ...tableScenarios, ...containerScenarios, ...spacingScenarios].map((markdown, index) => ({ name: `roundtrip ${String(index + 1).padStart(2, "0")}`, markdown }));

export const notionDiffScenarios = [
  ["no change", "first\n\nsecond", "first\n\nsecond", { inserted: 0, updated: 0, deleted: 0, moved: 0 }, []],
  ["update text", "first\n\nsecond", "first\n\nchanged", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["insert middle", "first\n\nthird", "first\n\nsecond\n\nthird", { inserted: 1, updated: 0, deleted: 0, moved: 0 }, ["set", "listAfter"]],
  ["insert first", "second", "first\n\nsecond", { inserted: 1, updated: 0, deleted: 0, moved: 0 }, ["set", "listBefore"]],
  ["insert last", "first", "first\n\nsecond", { inserted: 1, updated: 0, deleted: 0, moved: 0 }, ["set", "listAfter"]],
  ["delete first", "first\n\nsecond", "second", { inserted: 0, updated: 0, deleted: 1, moved: 0 }, ["listRemove"]],
  ["delete last", "first\n\nsecond", "first", { inserted: 0, updated: 0, deleted: 1, moved: 0 }, ["listRemove"]],
  ["replace heading text", "# Old", "# New", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["toggle todo checked", "- [ ] task", "- [x] task", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change list type", "- item", "1. item", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change quote text", "> old", "> new", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change code language", "```JavaScript\nx\n```", "```Ruby\nx\n```", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change code body", "```JavaScript\nx\n```", "```JavaScript\ny\n```", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change image alt", "![old](https://example.com/a.png)", "![new](https://example.com/a.png)", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["change image source", "![a](https://example.com/a.png)", "![a](https://example.com/b.png)", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["append after delete shape", "one\ntwo\n\nthree", "one\ntwo\n\nfour", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["delete multiple tail", "one\n\ntwo\n\nthree", "one", { inserted: 0, updated: 0, deleted: 2, moved: 0 }, ["listRemove"]],
  ["insert multiple tail", "one", "one\n\ntwo\n\nthree", { inserted: 2, updated: 0, deleted: 0, moved: 0 }, ["listAfter"]],
  ["replace divider", "---", "text", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
  ["replace table cell", "| A | B |\n|---|---|\n| 1 | 2 |", "| A | B |\n|---|---|\n| 1 | 3 |", { inserted: 0, updated: 1, deleted: 0, moved: 0 }, ["set"]],
].map(([name, remote, local, summary, commands]) => ({ name, remote, local, summary, commands }));

export const notionSyncScenarios = [
  ["remote only body", "# Page\n\nbase", "# Page\n\nbase", "# Page\n\nremote", "# Page\n\nremote", 0, false],
  ["local only body", "# Page\n\nbase", "# Page\n\nlocal", "# Page\n\nbase", "# Page\n\nlocal", 1, false],
  ["same local and remote body", "# Page\n\nbase", "# Page\n\nshared", "# Page\n\nshared", "# Page\n\nshared", 0, false],
  ["conflicting body", "# Page\n\nbase", "# Page\n\nlocal", "# Page\n\nremote", "", 0, true],
  ["local only title", "# Page\n\nbody", "# New Page\n\nbody", "# Page\n\nbody", "# New Page\n\nbody", 1, false],
  ["remote only title", "# Page\n\nbody", "# Page\n\nbody", "# Remote Page\n\nbody", "# Remote Page\n\nbody", 0, false],
  ["conflicting title", "# Page\n\nbody", "# Local Page\n\nbody", "# Remote Page\n\nbody", "", 0, true],
  ["local deletion", "# Page\n\nfirst\n\nsecond", "# Page\n\nfirst", "# Page\n\nfirst\n\nsecond", "# Page\n\nfirst", 1, false],
  ["remote deletion local unchanged", "# Page\n\nfirst\n\nsecond", "# Page\n\nfirst\n\nsecond", "# Page\n\nfirst", "# Page\n\nfirst", 0, false],
  ["local insertion", "# Page\n\nfirst", "# Page\n\nfirst\n\nsecond", "# Page\n\nfirst", "# Page\n\nfirst\n\nsecond", 1, false],
  ["local nested bullet title", "# Page\n\n- parent\n  - child pipe | value", "# Page\n\n- parent local\n  - child pipe | value", "# Page\n\n- parent\n  - child pipe | value", "# Page\n\n- parent local\n  - child pipe | value", 1, false],
  ["local nested callout title", "# Page\n\n:::callout\nParent\n  child\n:::", "# Page\n\n:::callout\nParent local\n  child\n:::", "# Page\n\n:::callout\nParent\n  child\n:::", "# Page\n\n:::callout\nParent local\n  child\n:::", 1, false],
  ["local heading toggle title", "# Page\n\n### Parent {toggle}\n  child", "# Page\n\n### Parent local {toggle}\n  child", "# Page\n\n### Parent {toggle}\n  child", "# Page\n\n### Parent local {toggle}\n  child", 1, false],
].map(([name, base, local, remote, expectedMarkdown, writes, throws]) => ({ name, base, local, remote, expectedMarkdown, writes, throws }));

export const notionScenarios = [...notionRoundTripScenarios, ...notionDiffScenarios, ...notionSyncScenarios];
