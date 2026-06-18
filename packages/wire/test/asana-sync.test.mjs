import assert from "node:assert/strict";
import test from "node:test";

import { asanaChanges, asanaConflicts, parseAsanaMarkdown, renderAsanaMarkdown } from "../dist/index.js";

const markdown = `# [Launch](https://app.asana.com/0/100/list)

## Product <!-- asana-section:200 -->

### [Beta](https://app.asana.com/0/100/task/300)

- [ ] [Ship API](https://app.asana.com/0/100/task/400)
  - [x] [Document API](https://app.asana.com/0/100/task/500)
- [ ] New task
  - [ ] New subtask
`;

function replace(document, key, values) {
  return { ...document, entities: document.entities.map((entity) => entity.key === key ? { ...entity, ...values } : entity) };
}

test("Asana Markdown round-trips project, section, milestone, task, and subtask URLs", () => {
  const document = parseAsanaMarkdown(markdown);
  assert.equal(document.projectGid, "100");
  assert.deepEqual(document.entities.map(({ kind, gid, parent, section, milestone, completed }) => ({ kind, gid, parent, section, milestone, completed })), [
    { kind: "project", gid: "100", parent: null, section: null, milestone: null, completed: false },
    { kind: "section", gid: "200", parent: null, section: null, milestone: null, completed: false },
    { kind: "milestone", gid: "300", parent: null, section: "section:200", milestone: null, completed: false },
    { kind: "task", gid: "400", parent: null, section: "section:200", milestone: "milestone:300", completed: false },
    { kind: "subtask", gid: "500", parent: "task:400", section: "section:200", milestone: "milestone:300", completed: true },
    { kind: "task", gid: null, parent: null, section: "section:200", milestone: "milestone:300", completed: false },
    { kind: "subtask", gid: null, parent: "new:task:5", section: "section:200", milestone: "milestone:300", completed: false },
  ]);
  assert.equal(renderAsanaMarkdown(document), markdown);
});

test("Asana Markdown reads the project ID from modern list URLs", () => {
  const document = parseAsanaMarkdown("# [Project](https://app.asana.com/1/311773678927/project/1213253233295838/list/1213253233295868)\n\n## Section <!-- asana-section:200 -->\n");
  assert.equal(document.projectGid, "1213253233295838");
});

test("Asana Markdown round-trips names with newlines", () => {
  const document = {
    projectGid: "100",
    projectUrl: "https://app.asana.com/0/100/list",
    entities: [
      { key: "project:100", gid: "100", kind: "project", name: "Launch\nPlan", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "section:200", gid: "200", kind: "section", name: "Product\nWork", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "milestone:300", gid: "300", kind: "milestone", name: "Beta\nGate", completed: false, parent: null, section: "section:200", milestone: null, order: 0 },
      { key: "task:400", gid: "400", kind: "task", name: "Ship\nAPI", completed: false, parent: null, section: "section:200", milestone: "milestone:300", order: 1 },
      { key: "subtask:500", gid: "500", kind: "subtask", name: "Document\nAPI", completed: true, parent: "task:400", section: "section:200", milestone: "milestone:300", order: 0 },
    ],
  };
  const rendered = renderAsanaMarkdown(document);
  assert.match(rendered, /Launch\\nPlan/);
  assert.deepEqual(parseAsanaMarkdown(rendered), document);
});

test("Asana Markdown round-trips names with brackets", () => {
  const document = {
    projectGid: "100",
    projectUrl: "https://app.asana.com/0/100/list",
    entities: [
      { key: "project:100", gid: "100", kind: "project", name: "Launch [Q3]", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "section:200", gid: "200", kind: "section", name: "Product [Core]", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "milestone:300", gid: "300", kind: "milestone", name: "Beta [Gate]", completed: false, parent: null, section: "section:200", milestone: null, order: 0 },
      { key: "task:400", gid: "400", kind: "task", name: "Fix [parser]", completed: false, parent: null, section: "section:200", milestone: "milestone:300", order: 1 },
      { key: "subtask:500", gid: "500", kind: "subtask", name: "Document [API]", completed: true, parent: "task:400", section: "section:200", milestone: "milestone:300", order: 0 },
    ],
  };
  const rendered = renderAsanaMarkdown(document);
  assert.ok(rendered.includes("Launch \\[Q3\\]"));
  assert.ok(rendered.includes("Fix \\[parser\\]"));
  assert.deepEqual(parseAsanaMarkdown(rendered), document);
});

test("Asana Markdown round-trips completed milestones", () => {
  const document = {
    projectGid: "100",
    projectUrl: "https://app.asana.com/0/100/list",
    entities: [
      { key: "project:100", gid: "100", kind: "project", name: "Launch", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "section:200", gid: "200", kind: "section", name: "Product", completed: false, parent: null, section: null, milestone: null, order: 0 },
      { key: "milestone:300", gid: "300", kind: "milestone", name: "Beta", completed: true, parent: null, section: "section:200", milestone: null, order: 0 },
    ],
  };
  const rendered = renderAsanaMarkdown(document);
  assert.match(rendered, /### \[x\] \[Beta\]/);
  assert.deepEqual(parseAsanaMarkdown(rendered), document);
  assert.deepEqual(asanaChanges(document, parseAsanaMarkdown(rendered)), []);
});

test("Asana changes detect independent field edits and hierarchy edits", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = replace(base, "task:400", { name: "Ship public API", completed: true, section: "section:201", milestone: "milestone:301" });
  assert.deepEqual(asanaChanges(base, local), [
    { operation: "update", key: "task:400", field: "name", value: "Ship public API" },
    { operation: "update", key: "task:400", field: "completed", value: true },
    { operation: "update", key: "task:400", field: "section", value: "section:201" },
    { operation: "update", key: "task:400", field: "milestone", value: "milestone:301" },
    { operation: "update", key: "task:400", field: "order", value: null },
  ]);
});

test("Asana conflict detection allows independent local and remote edits", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = replace(base, "task:400", { name: "Local name" });
  const remote = replace(base, "task:400", { completed: true });
  assert.deepEqual(asanaConflicts(asanaChanges(base, local), asanaChanges(base, remote)), []);
});

test("Asana conflict detection rejects different edits to the same field", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = replace(base, "task:400", { name: "Local name" });
  const remote = replace(base, "task:400", { name: "Remote name" });
  assert.deepEqual(asanaConflicts(asanaChanges(base, local), asanaChanges(base, remote)), ["task:400.name"]);
});

test("Asana conflict detection rejects local drift after remote deletion", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = replace(base, "task:400", { name: "Local name" });
  const remote = { ...base, entities: base.entities.filter((entity) => entity.key !== "task:400") };
  assert.deepEqual(asanaConflicts(asanaChanges(base, local), asanaChanges(base, remote)), ["task:400"]);
});

test("Asana conflict detection preserves remote insert beside local insert", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = parseAsanaMarkdown(renderAsanaMarkdown(base).replace(/\n$/, "\n- [ ] Local insert\n"));
  const remote = { ...base, entities: [...base.entities, { key: "task:600", gid: "600", kind: "task", name: "Remote insert", completed: false, parent: null, section: "section:200", milestone: "milestone:300", order: 2 }] };
  assert.deepEqual(asanaConflicts(asanaChanges(base, local), asanaChanges(base, remote)), []);
});

test("Asana changes ignore index shifts caused only by fresh inserts", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const remote = { ...base, entities: base.entities.map((entity) => entity.kind === "task" ? { ...entity, order: entity.order + 1 } : entity).concat({ key: "task:600", gid: "600", kind: "task", name: "Remote first", completed: false, parent: null, section: "section:200", milestone: "milestone:300", order: 1 }) };
  assert.deepEqual(asanaChanges(base, remote), [{ operation: "create", key: "task:600", field: null, value: remote.entities.at(-1) }]);
});

test("Asana changes detect relative reorder among existing siblings", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", "").replace("  - [x] [Document API](https://app.asana.com/0/100/task/500)\n", "").replace("- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n", "- [ ] [Ship API](https://app.asana.com/0/100/task/400)\n- [ ] [Ship UI](https://app.asana.com/0/100/task/401)\n"));
  const other = { ...base, entities: base.entities.map((entity) => entity.key === "task:400" ? { ...entity, order: 2 } : entity.key === "task:401" ? { ...entity, order: 1 } : entity) };
  assert.deepEqual(asanaChanges(base, other).filter((change) => change.field === "order"), [
    { operation: "update", key: "task:401", field: "order", value: "milestone:300" },
    { operation: "update", key: "task:400", field: "order", value: "task:401" },
  ]);
});

test("Asana conflict detection accepts identical edits and identical deletions", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const renamed = replace(base, "task:400", { name: "Shared name" });
  assert.deepEqual(asanaConflicts(asanaChanges(base, renamed), asanaChanges(base, renamed)), []);
  const deleted = { ...base, entities: base.entities.filter((entity) => entity.key !== "task:400" && entity.parent !== "task:400") };
  assert.deepEqual(asanaConflicts(asanaChanges(base, deleted), asanaChanges(base, deleted)), []);
});

test("Asana conflict detection rejects delete against remote field edit", () => {
  const base = parseAsanaMarkdown(markdown.replace("- [ ] New task\n  - [ ] New subtask\n", ""));
  const local = { ...base, entities: base.entities.filter((entity) => entity.key !== "task:400" && entity.parent !== "task:400") };
  const remote = replace(base, "task:400", { completed: true });
  assert.deepEqual(asanaConflicts(asanaChanges(base, local), asanaChanges(base, remote)), ["task:400"]);
});

test("Asana Markdown rejects malformed hierarchy and duplicate identities", () => {
  assert.throws(() => parseAsanaMarkdown("# [Project](https://app.asana.com/0/100/list)\n\n- [ ] Task\n"), /task appears outside a section/);
  assert.throws(() => parseAsanaMarkdown("# [Project](https://app.asana.com/0/100/list)\n\n## Group\n\n  - [ ] Subtask\n"), /subtask appears without a task/);
  assert.throws(() => parseAsanaMarkdown("# [Project](https://app.asana.com/0/100/list)\n\n## Group\n\nnot a task\n"), /Unsupported Asana Markdown/);
  assert.throws(() => parseAsanaMarkdown("# [Project](https://app.asana.com/0/100/list)\n\n## Group\n\n- [ ] [One](https://app.asana.com/0/100/task/400)\n- [ ] [Two](https://app.asana.com/0/100/task/400)\n"), /Duplicate Asana identity 400/);
});
