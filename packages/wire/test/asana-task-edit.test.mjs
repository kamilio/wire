import assert from "node:assert/strict";
import test from "node:test";
import { addAsanaComment, createAsanaTask, editAsanaComment, editAsanaTask, showAsanaTask } from "provider-asana";
import { asanaMarkdown, asanaRichText } from "../../provider-asana/dist/asana-markdown.js";

function api(handler) {
  return { cookies: { loadSaved: async () => [{ name: "ticket", value: "fixture" }] }, http: { request: async (url, init) => {
    assert.equal(init.headers.Cookie, "ticket=fixture");
    const result = await handler(url.pathname.slice("/api/1.0".length), init.method ?? "GET", init.body && JSON.parse(init.body).data, url.searchParams);
    return result instanceof Response ? result : Response.json(result);
  } } };
}

const examples = [
  ["**bold and *italic***, ~~gone~~, <u>underline</u>", "<strong>bold and <em>italic</em></strong>, <s>gone</s>, <u>underline</u>"],
  ["- First\n  1. Nested\n  2. Again\n- Last", "<ul><li>First<ol><li>Nested</li><li>Again</li></ol></li><li>Last</li></ul>"],
  ["A [link](https://example.com/?a=1&b=2) & `<tag>`", 'A <a href="https://example.com/?a=1&amp;b=2">link</a> &amp; <code>&lt;tag&gt;</code>'],
  ["````js\nconst x = \`a && b\`;\n\n\n// <tag>\n````", '<pre data-language="js">const x = `a &amp;&amp; b`;\n\n\n// &lt;tag&gt;</pre>'],
  ["> Keep **this**\n> on two lines", "<blockquote>Keep <strong>this</strong>\non two lines</blockquote>"],
  ["Just \\*literal\\* and <script>alert(1)</script>", "Just *literal* and &lt;script&gt;alert(1)&lt;/script&gt;"],
  ["[Ada](asana://123)", '<a data-asana-gid="123"></a>'],
];
for (const target of ["task", "comment"]) {
  test(`Markdown to Asana ${target} XML and back preserves supported formatting`, () => {
    for (const [md, inner] of examples) {
      const html = `<body>${inner}</body>`;
      assert.equal(asanaRichText(md, target), html, md);
      assert.equal(asanaRichText(asanaMarkdown(html), target), html, md);
    }
  });
}

test("native links retain clickable destinations and mention identity; literal list markers stay literal", () => {
  const md = asanaMarkdown('<body><a href="https://app.asana.com/0/123/list" data-asana-gid="123">Team</a></body>');
  assert.match(md, /https:\/\/app.asana.com/);
  assert.equal(asanaRichText(md, "comment"), '<body><a data-asana-gid="123"></a></body>');
  const literal = "<body>1. not a list</body>";
  assert.equal(asanaRichText(asanaMarkdown(literal), "task"), literal);
  assert.throws(() => asanaRichText("an <u>unclosed underline", "comment"), /underline/);
});

test("task-only Markdown formats use task tags; comments never post task-only tags", () => {
  const md = "# Result\n\n| a | b |\n| --- | --- |\n| 0 | ⇨ |\n\n![photo](asana://123)";
  const html = '<body><h1>Result</h1>\n\n<table><tr><td>a</td><td>b</td></tr><tr><td>0</td><td>⇨</td></tr></table>\n\n<img data-asana-gid="123"/></body>';
  assert.equal(asanaRichText(md, "task"), html);
  assert.equal(asanaRichText(asanaMarkdown(html), "task"), html);
  assert.equal(asanaRichText("# Result", "comment"), "<body><strong>Result</strong></body>");
  assert.throws(() => asanaRichText(md, "comment"), /tables in task descriptions only/);
  assert.throws(() => asanaRichText("[x](javascript:alert)", "comment"), /absolute HTTP/);
});

test("create writes a project task with or without assignment and a Markdown description", async () => {
  const calls = [];
  const created = { gid: "2", permalink_url: "https://app.asana.com/0/1/2" };
  const runtime = api((path, method, data, params) => {
    assert.equal(path, "/tasks");
    assert.equal(method, "POST");
    assert.match(params.get("opt_fields"), /permalink_url/);
    calls.push(data);
    return { data: created };
  });
  await assert.rejects(createAsanaTask(runtime, "bad", "Ship"), /numeric Asana project/);
  await assert.rejects(createAsanaTask(runtime, "1", " "), /title cannot be empty/);
  assert.deepEqual(await createAsanaTask(runtime, "1", "Ship", "**Ready**", "ada@example.com"), created);
  await createAsanaTask(runtime, "1", "Next");
  assert.deepEqual(calls, [
    { projects: ["1"], name: "Ship", html_notes: "<body><strong>Ready</strong></body>", assignee: "ada@example.com" },
    { projects: ["1"], name: "Next" },
  ]);
});

test("edit assigns by email and writes Markdown and native field values in a single partial update", async () => {
  const calls = [];
  const runtime = api((path, method, data) => {
    calls.push([path, method, data]);
    return method === "GET" ? { data: { custom_fields: [{ gid: "3", resource_subtype: "text" }, { gid: "4", resource_subtype: "enum" }] } } : { data: { gid: "1" } };
  });
  const native = { "4": "01234567890123456789", "5": 0, "6": null, "7": ["8", "9"] };
  await editAsanaTask(runtime, "1", { assignee: "ada@example.com", notes: "**New**", completed: false, custom_fields: { "3": "A *note*", ...native } });
  assert.deepEqual(calls, [
    ["/tasks/1", "GET", undefined],
    ["/tasks/1", "PUT", { assignee: "ada@example.com", html_notes: "<body><strong>New</strong></body>", completed: false, custom_fields: native, html_custom_fields: { "3": "<body>A <em>note</em></body>" } }],
  ]);
  calls.length = 0;
  await editAsanaTask(runtime, "1", { assignee: null });
  assert.deepEqual(calls, [["/tasks/1", "PUT", { assignee: null }]]);
});

test("comment creation and replacement use the right endpoint, story ID, and Markdown conversion", async () => {
  const calls = [];
  const runtime = api((path, method, data) => { calls.push([method, path, data]); return { data: { gid: "98" } }; });
  const body = { html_text: "<body>**literal**\n\n<ul><li><strong>item</strong></li></ul></body>" };
  const md = "\\*\\*literal\\*\\*\n\n- **item**";
  const created = await addAsanaComment(runtime, "11", md);
  await editAsanaComment(runtime, created.gid, md);
  assert.deepEqual(calls, [["POST", "/tasks/11/stories", body], ["PUT", "/stories/98", body]]);
});

test("invalid inputs do not write; forbidden comment edits are surfaced without posting a replacement", async () => {
  let calls = 0;
  const runtime = api(() => { calls++; return new Response("Not authorized to edit this story", { status: 403 }); });
  await assert.rejects(editAsanaTask(runtime, "1", {}), /No task fields/);
  await assert.rejects(editAsanaTask(runtime, "1", { html_notes: "<body/>" }), /Use Markdown/);
  await assert.rejects(addAsanaComment(runtime, "../stories/1", "text"), /numeric/);
  await assert.rejects(editAsanaComment(runtime, "1", "  "), /empty/);
  await assert.rejects(addAsanaComment(runtime, "1", "|a|\n|---|"), /tables/);
  assert.equal(calls, 0);
  await assert.rejects(editAsanaComment(runtime, "1", "text"), /403.*Not authorized/);
  assert.equal(calls, 1);
});

test("show preserves Markdown, custom field IDs and values, and every page of comments separately from system activity", async () => {
  const task = { name: "Sample", notes: "fallback", html_notes: "<body><strong>Notes</strong></body>", assignee: { name: "Ada", email: "ada@example.com" }, due_on: "2026-12-01",
    custom_fields: [{ gid: "3", name: "Score", resource_subtype: "number", display_value: "0" }, { gid: "4", name: "Summary", resource_subtype: "text", html_text_value: "<body><em>Rich</em></body>" }] };
  const stories = [{ gid: "11", type: "comment", text: "fallback", html_text: "<body><code>x</code></body>", is_editable: true, created_by: { name: "Ada" } },
    { gid: "12", type: "system", text: "Moved", created_by: null }, { gid: "13", type: "comment", text: "second page", created_by: { name: "Bob" } }];
  const runtime = api((path, method, data, params) => {
    assert.equal(method, "GET");
    if (path === "/tasks/1") { assert.match(params.get("opt_fields"), /custom_fields.enum_options.name/);return { data: task }; }
    assert.match(params.get("opt_fields"), /html_text/);
    return params.get("offset") === "more" ? { data: stories.slice(2), next_page: null } : { data: stories.slice(0, 2), next_page: { offset: "more" } };
  });
  const result = await showAsanaTask(runtime, "1");
  assert.match(result.markdown, /\*\*Notes\*\*/);
  assert.match(result.markdown, /Score \(3, number\): 0/);
  assert.match(result.markdown, /Summary \(4, text\): \*Rich\*/);
  assert.match(result.markdown, /## Comments[\s\S]*11, editable[\s\S]*`x`[\s\S]*13\][\s\S]*second page[\s\S]*## Activity[\s\S]*Moved/);
  assert.equal(result.data.task.body_markdown, "**Notes**");
  assert.deepEqual(result.data.stories.map(s => [s.gid, s.body_markdown]), [["11", "`x`"], ["12", undefined], ["13", "second page"]]);
});
