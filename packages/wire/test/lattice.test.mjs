import assert from "node:assert/strict";
import { test } from "node:test";
import { composeWire } from "wire-core";
import { latticeService } from "provider-lattice";
import { richText } from "../../provider-lattice/dist/markdown.js";

const cases = [
  ["paragraphs and line breaks", "<p>One &amp; two</p><p>Line<br>next</p>", "One & two\n\nLine  \nnext"],
  ["headings", "<h2>Results</h2><p>Met target</p>", "## Results\n\nMet target"],
  ["nested marks", "<p><strong>one <em>two</em></strong> <del>three</del></p>", "**one *two*** ~~three~~"],
  [
    "styled paste",
    '<span style="font-weight: 700">Bold</span> <span style="font-style:italic">italic</span>',
    "**Bold** *italic*",
  ],
  [
    "ordered and nested lists",
    '<ol start="3"><li>One<ul><li>Child</li></ul></li><li>Two</li></ol>',
    "3.  One\n    -   Child\n4.  Two",
  ],
  ["blockquote paragraphs", "<blockquote><p>One</p><p>Two</p></blockquote>", "> One\n> \n> Two"],
  [
    "person labels",
    '<p><span data-type="mention" data-label="Zoë 李"></span> and <a href="https://example.org/u">Adé</a></p>',
    "Zoë 李 and [Adé](https://example.org/u)",
  ],
  ["visible name beats stored id", '<span data-mention="123">@Sam</span>', "@Sam"],
  ["image alt", '<img alt="Ana" src="https://example.org/ana.png">', "![Ana](https://example.org/ana.png)"],
  ["unsafe link keeps name", '<p><a href="javascript:alert(1)">Ana</a></p>', "Ana"],
  [
    "tables and literal pipes",
    "<table><tr><th>A</th></tr><tr><td><b>x</b> | y</td></tr></table>",
    "| A |\n| --- |\n| **x** \\| y |",
  ],
  ["inline code containing a backtick", "<p>Open <code>const n = `x`</code>.</p>", "Open `` const n = `x` ``."],
  ["code fence collisions", '<pre><code class="language-ts">a\n```\nb</code></pre>', "````ts\na\n```\nb\n````"],
  [
    "HTML entities in existing Markdown",
    "**O&#39;Brien** &amp; Zoë\n\n- First\n  - Second",
    "**O'Brien** & Zoë\n\n- First\n  - Second",
  ],
  ["literal HTML in existing code", "Use `<p>` or `<br>` here<br>next.", "Use `<p>` or `<br>` here  \nnext."],
  ["escaped angle brackets", "&lt;b&gt;literal&lt;/b&gt;", "<b>literal</b>"],
  ["malformed editor HTML", "<p>name <em>here</em></p><ul><li>one<li>two</ul>", "name *here*\n\n-   one\n-   two"],
  ["script and style", "<p>Visible</p><script>doBad()</script><style>p{}</style>", "Visible"],
  [
    "compact prose without changing a code block",
    "a\n\n\n\nb\n\n```\nx\n\n\n\ny\n```",
    "a\n\nb\n\n```\nx\n\n\n\ny\n```",
  ],
  ["blank editor", "<p><br></p>", ""],
];
for (const [name, input, expected] of cases)
  test("Lattice rich text: " + name, () => assert.equal(richText(input), expected));

const origin = "https://team.latticehq.com";
const id = (n) => "12345678-aaaa-4aaa-bbbb-" + String(n).padStart(12, "0");
const page = (nodes, cursor = null) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: cursor !== null, endCursor: cursor },
});
const name = { name: "Renée Lee (deactivated)" };
const feedback = (n) => ({
  __typename: "Feedback",
  entityId: id(n),
  createdAt: "2025-04-0" + n,
  visibility: "private",
  author: name,
  targets: [{ name: "Jo Li" }],
  body: "<p>Nice <b>work</b>.</p>",
  companyValues: [],
  feedbackRequest: null,
});
function runtime(resolve) {
  const calls = [];
  return {
    calls,
    process: {
      async execute(command, args) {
        const code = args.at(-1);
        if (!args.includes("run-code")) {
          calls.push(command === "hey-browser" ? "attach" : "detach");
          return { stdout: "", stderr: "" };
        }
        const { query, variables } = JSON.parse(code.match(/,data:(\{.*\})\}\);/)[1]);
        assert.match(query, /^query /);
        assert.doesNotMatch(query, /\bmutation\b/);
        calls.push([query, variables]);
        return { stdout: JSON.stringify({ data: resolve(query, variables) }), stderr: "" };
      },
    },
  };
}

test("Lattice downloads every page of given feedback to stable linked paths with author names", async () => {
  const url = origin + "/users/" + id(1) + "/feedback";
  const input = runtime((query, vars) =>
    query.includes("viewerVisibleFeedback")
      ? { viewer: { user: { feed: vars.after ? page([feedback(3)]) : page([feedback(2)], "next") } } }
      : { viewer: { user: { ...name, entityId: id(1) } } },
  );
  const files = new Map();
  const result = await latticeService.download(
    input,
    url,
    latticeService.parse(new URL(url)),
    () => {
      throw Error("Archive must never overwrite");
    },
    async (p, s) => {
      files.set(p, s);
      return p;
    },
  );
  assert.equal(files.size, 3);
  for (const n of [2, 3]) {
    assert.ok(
      result.markdown.includes("2025-04-0" + n + "-Feedback-from-Renée-Lee-to-Jo-Li.md".replace("é", "%C3%A9")),
    );
    assert.match(
      files.get("lattice/Renée Lee/Feedback/Given/Jo Li/2025-04-0" + n + "-Feedback-from-Renée-Lee-to-Jo-Li.md"),
      /Renée Lee to Jo Li[\s\S]*Nice \*\*work\*\*/,
    );
  }
  assert.equal(input.calls.at(-1), "detach");
  assert.deepEqual(
    input.calls
      .filter(Array.isArray)
      .slice(1)
      .map((c) => c[1]),
    [
      { after: null, direction: "GIVEN" },
      { after: "next", direction: "GIVEN" },
    ],
  );
});

test("Lattice exposes no write operations and only matches its HTTPS tenant and entity routes", () => {
  const cycle = origin + "/reviews/" + id(1) + "/participant/requests";
  for (const url of [
    cycle,
    cycle + "?back=%2F",
    origin + "/feedback/" + id(2),
    origin + "/reviews/" + id(2) + "/participant/reviewee-packet",
  ])
    assert.ok(latticeService.matches(new URL(url)));
  for (const url of [
    cycle.replace("https", "http"),
    cycle.replace(".com/", ".com.attacker.test/"),
    cycle.replace("team.", "name@team."),
    origin + "/admin",
    origin + "/logout",
  ])
    assert.ok(!latticeService.matches(new URL(url)));
  assert.equal(latticeService.synchronize, undefined);
  assert.equal(latticeService.upload, undefined);
});

test("Lattice preserves anonymous authors and calibrated and original rating labels", async () => {
  const url = origin + "/reviews/" + id(1) + "/manager/direct-reports/" + id(2);
  const q = {
    isPrivate: false,
    question: { body: "Impact?", scale: ["Low", "High"] },
    calibrated: 2,
    response: { content: { body: "<strong>Thoughtful</strong>", rating: 1 } },
  };
  const input = runtime((query) =>
    query.includes("responsesGroupedByReviewer")
      ? {
          viewer: {
            cycle: {
              name: "Winter",
              createdAt: "2024-02-01",
              hasCalibrationEnded: true,
              person: {
                user: name,
                reviewSummary: null,
                reviewPacket: {
                  groups: [
                    {
                      isRejected: false,
                      reviewerRole: "PEER",
                      reviewer: null,
                      questions: [q, { ...q, isPrivate: true }],
                    },
                  ],
                },
              },
            },
          },
        }
      : { viewer: { user: { ...name, entityId: id(3) } } },
  );
  const result = await latticeService.fetch(input, url, latticeService.parse(new URL(url)));
  assert.match(result.markdown, /Author not disclosed · peer/);
  assert.match(result.markdown, /\*\*Thoughtful\*\*[\s\S]*Rating: Low[\s\S]*Calibrated rating: High/);
  assert.equal(result.markdown.split("Calibrated rating:").length, 2);
});

test("individual downloads write only the requested feedback or packet contribution", async () => {
  const packet = origin + "/reviews/" + id(1) + "/manager/direct-reports/" + id(2);
  const input = runtime((query) => {
    if (query.includes("viewerVisibleFeedback"))
      return { viewer: { user: { feed: page([feedback(2), feedback(3)]) } } };
    if (query.includes("responsesGroupedByReviewer"))
      return { viewer: { cycle: {
        name: "Winter", createdAt: "2024-01-01", hasCalibrationEnded: false,
        person: { user: name, reviewSummary: null, reviewPacket: { groups: [4, 5].map(n => ({
          isRejected: false, reviewerRole: "PEER", reviewer: { user: { name: "Adé " + n + " (deactivated)" } },
          questions: [{ entityId: id(n), reviewRequest: { submittedAt: "2024-02-11" },
            isPrivate: false, question: { body: "Impact?" }, response: { content: "Helped the team." } }],
        })) } },
      } } };
    return { viewer: { user: { ...name, entityId: id(1) } } };
  });
  const files = new Map();
  const download = (url) => latticeService.download(input, url, latticeService.parse(new URL(url)), null,
    async (p, md) => { files.set(p, md); return p; });
  await download(origin + "/feedback/" + id(3));
  assert.equal(files.size, 1);
  const item = await download(packet + "#review-" + id(5));
  assert.equal(files.size, 2);
  assert.equal(item.path, "lattice/Team/Winter/Renée Lee/peer/2024-02-11-Adé-5-on-Renée-Lee.md");
  assert.match(item.markdown, /Adé 5 → Renée Lee/);
  assert.doesNotMatch(item.markdown, /deactivated|Adé 4/);
  const all = await download(packet);
  assert.match(all.markdown, /## \[Adé 5 · peer\]\(peer\/2024-02-11-Ad%C3%A9-5-on-Ren%C3%A9e-Lee.md\)/);
});

test("historical manager assignments supplement the current roster without duplicate packets", async () => {
  const url = origin + "/users/" + id(1) + "/reviews";
  const c = { entityId: id(2), name: "Winter 2022", createdAt: "2022-12-01" };
  const former = { entityId: id(3), user: { name: "Former Report" }, viewerCanViewManagerPDFReviewPacket: true };
  const current = { entityId: id(4), user: { name: "Current Report" }, viewerCanViewManagerPDFReviewPacket: true };
  const unavailable = {
    ...former,
    entityId: id(8),
    user: { name: "Another Report" },
    viewerCanViewManagerPDFReviewPacket: false,
  };
  const assignment = (person, n) => ({
    entityId: id(n),
    status: "COMPLETE",
    reviewGroup: { type: "manager" },
    reviewee: person,
  });
  const input = runtime((query, vars) => {
    if (query.includes("cycles:reviewCycles")) return { viewer: { user: { cycles: page([c]) } } };
    if (query.includes("viewerReviewGroupsToRespond"))
      return {
        viewer: {
          cycle: {
            viewerReviewee: null,
            groups: [
              {
                id: "group",
                requests: vars.after
                  ? page([assignment(current, 6), assignment(unavailable, 7)])
                  : page([assignment(former, 5)], "more"),
              },
            ],
          },
        },
      };
    if (query.includes("viewerDirectReportReviewees")) return { viewer: { cycle: { reports: page([current]) } } };
    return { viewer: { user: { ...name, entityId: id(1) } } };
  });
  const { markdown } = await latticeService.fetch(input, url, latticeService.parse(new URL(url)));
  assert.match(markdown, /Winter 2022/);
  assert.match(markdown, /Renée Lee → Former Report/);
  const reports = markdown.split("### Direct reports")[1];
  assert.match(reports, /Former Report/);
  assert.equal(reports.split("Current Report").length, 2);
  assert.doesNotMatch(reports, /Another Report/);
  assert.ok(input.calls.some((c) => Array.isArray(c) && c[1].after === "more"));
});

test("a failed feed or non-advancing cursor cannot produce a success index", async () => {
  const url = origin + "/users/" + id(1) + "/feedback";
  const input = runtime((query) =>
    query.includes("viewerVisibleFeedback")
      ? { viewer: { user: { feed: page([], "same") } } }
      : { viewer: { user: { ...name, entityId: id(1) } } },
  );
  await assert.rejects(
    latticeService.fetch(input, url, latticeService.parse(new URL(url))),
    /pagination did not advance/,
  );
  assert.equal(input.calls.at(-1), "detach");
});

test("a departed person's packet, original answer, edits and every previous index survive later scrapes", async () => {
  let feed = [feedback(2), feedback(3)];
  const input = runtime((q) =>
    q.includes("viewerVisibleFeedback")
      ? { viewer: { user: { feed: page(feed) } } }
      : { viewer: { user: { ...name, entityId: id(1) } } },
  );
  const files = new Map();
  const wire = composeWire({
    home: "/workspace",
    fetchInput: input,
    catalog: [latticeService],
    filesystem: {
      exists: async (p) => files.has(p),
      isFile: async (p) => files.has(p),
      readText: async (p) => files.get(p),
      writeText: async () => {
        throw Error("archive attempted to overwrite a file");
      },
      createText: async (p, s) => {
        if (files.has(p)) return false;
        files.set(p, s);
        return true;
      },
    },
    workspace: {},
    now: () => new Date("2026-01-01"),
    initialization: { backend: "files", registryPath: "records" },
  });
  const download = () => wire.downloadSource(origin + "/users/" + id(1) + "/feedback", "/archive");
  const first = await download();
  const initial = new Map(files);
  assert.equal(initial.size, 3);
  feed = [{ ...feedback(2), body: "Revised answer" }];
  const next = await download();
  assert.match(next.path, /feedback\.2\.md$/);
  assert.match(next.markdown, /2025-04-02-[^)]*\.2\.md/);
  assert.doesNotMatch(next.markdown, /2025-04-03-/);
  assert.equal(files.size, 5);
  for (const [path, body] of initial) assert.equal(files.get(path), body);
  assert.match(files.get(first.path), /2025-04-03-/);
  assert.equal((await download()).path, next.path);
  assert.equal(files.size, 5);
});

test("scrape discovers personal packets and a report's cycle even when the viewer never participated", async () => {
  const own = { name: "Spring", createdAt: "2022-04-19", entityId: id(2) },
    old = { name: "Before I joined", createdAt: "2021-05-17", entityId: id(3) };
  const report = { entityId: id(4), user: { name: "Morgan" }, visible: true };
  const input = runtime((query, vars) => {
    if (query.includes("viewerVisibleFeedback") || query.includes("allDirectAndCustomRelationshipReportFeedback"))
      return query.includes("allDirect")
        ? { viewer: { feed: page([]) } }
        : { viewer: { user: { feed: page([]) } } };
    if (query.includes("reportsList")) return { viewer: { user: { reportsList: [{ entityId: id(5) }] } } };
    if (query.includes("findUser(userId:"))
      return { viewer: { person: { cycles: page([{ ...old, person: report }]) } } };
    if (query.includes("cycles:reviewCycles")) return { viewer: { user: { cycles: page([own]) } } };
    if (query.includes("viewerReviewGroupsToRespond"))
      return {
        viewer: {
          cycle: {
            groups: [],
            viewerReviewee: vars.cycle === own.entityId ? { responsesReleasedAt: "2025-01-01" } : null,
          },
        },
      };
    if (query.includes("viewerDirectReportReviewees")) return { viewer: { cycle: { reports: page([]) } } };
    if (query.includes("responsesGroupedByReviewer"))
      return {
        viewer: {
          cycle: {
            name: vars.report ? old.name : own.name,
            createdAt: vars.report ? old.createdAt : own.createdAt,
            hasCalibrationEnded: true,
            person: { user: vars.report ? report.user : name, reviewSummary: null, reviewPacket: { groups: [] } },
          },
        },
      };
    return { viewer: { user: { ...name, entityId: id(1) } } };
  });
  const files = [];
  const result = await latticeService.download(
    input,
    origin + "/",
    latticeService.parse(new URL(origin)),
    () => {
      throw Error("overwrite");
    },
    async (p) => {
      files.push(p);
      return p;
    },
  );
  assert.ok(files.some((p) => p.endsWith("Renée Lee/Spring/My packet/2022-04-19-Review-packet-for-Renée-Lee.md")));
  assert.ok(files.some((p) => p.endsWith("Team/Before I joined/Morgan/2021-05-17-Review-packet-for-Morgan.md")));
  assert.match(result.markdown, /Before I joined[\s\S]*Morgan/);
});

test("current template round trips with draft-only native answers and rejects invalid documents before saving", async () => {
  const { latticeReviewDraft } = await import("provider-lattice");
  const { readFile, stat } = await import("node:fs/promises");
  const url = origin + "/reviews/" + id(1) + "/participant/response/" + id(2);
  const question = (n, body, type, options) => ({
    id: id(n),
    description: "Live guidance",
    isPrivate: true,
    reviewResponse: null,
    revision: {
      body,
      __typename: type + "QuestionRevision",
      question: { isOptional: false },
      ...options,
    },
  });
  const qs = [
    question(3, "How did it go?", "Body"),
    question(4, "Choose", "MultipleChoiceAndBody", { choices: ["One", "Two"] }),
    question(5, "Level?", "Rating", { scale: ["Learning", "Strong"] }),
    question(6, "Skills", "MultipleSelect", {
      choices: ["Writing", "Coaching"],
    }),
  ];
  qs[1].reviewResponse = {
    content: { body: "Existing comment", multipleSelect: ["0"] },
  };
  const r = {
    entityId: id(2),
    viewerIsResponder: true,
    submittedAt: null,
    lockedAt: null,
    closedAt: null,
    isRejected: false,
    reviewee: {
      user: { name: "Émilia" },
      reviewCycle: {
        entityId: id(1),
        name: "Winter",
        canReviewsBeWritten: true,
      },
    },
    reviewGroup: {
      type: "peer",
      reviewTemplate: {
        name: "Team feedback",
        instructions: "<strong>Examples please.</strong>",
        wordCountLimit: null,
      },
    },
    questions: qs,
  };
  const input = runtime(() => ({ viewer: { r } }));
  const execute = input.process.execute.bind(input.process);
  let saved;
  let script;
  input.process.execute = async (cmd, args) => {
    const file = args.find((a) => a.startsWith("--filename="))?.slice(11);
    if (!file) return execute(cmd, args);
    script = file;
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const run = Function("return (" + (await readFile(file, "utf8")) + ")")();
    const body = await run({
      request: {
        post: async (address, { maxRedirects, data }) => {
          assert.equal(address, origin + "/graphql");
          assert.equal(maxRedirects, 0);
          assert.match(data.query, /^mutation SaveDraftReviewResponsesMutation/);
          assert.doesNotMatch(data.query, /\bsubmitReview\w*\s*\(/i);
          saved = data.variables.input.reviewRequestQuestions;
          return {
            json: async () => ({
              data: {
                saveDraftReviewResponses: {
                  errors: [],
                  results: saved.map((u) => ({
                    reviewRequest: { entityId: id(2), submittedAt: null },
                    reviewRequestQuestion: {
                      id: u.reviewRequestQuestionId,
                      reviewResponse: { content: u.content },
                    },
                  })),
                },
              },
            }),
          };
        },
      },
    });
    return { stdout: JSON.stringify(body), stderr: "" };
  };
  const template = await latticeReviewDraft(input, url);
  assert.match(template, /\*\*Examples please\.\*\*/);
  assert.match(template, /Choices: One · Two/);
  assert.equal(await latticeReviewDraft(input, url, template), "No draft changes.");
  const answered =
    template
      .replace("\n\n## Choose", "\n\n**Émilia** & Jo\n\n- helped\n- shipped\n\n## Choose")
      .replace("Selected: One\n\nExisting comment", "Selected: Two")
      .replace("\n\n## Skills", "\n\nRating: Strong\n\n## Skills") + "\nSelected: Writing\nSelected: Coaching";
  for (const [invalid, error] of [
    [answered.replace("## Choose", "## Mystery"), /Unknown question/],
    [answered.replace("## Choose", "## Skills"), /Repeated question/],
    [answered.slice(0, answered.indexOf("## Skills")), /Missing question/],
    [answered.replace("Selected: Coaching", "Selected: French"), /Invalid choice/],
    [answered.replace("Selected: Two", "Selected: One\nSelected: Two"), /number of choices/],
    [answered.replace("Team feedback —", "Wrong —"), /header does not match/],
  ])
    await assert.rejects(latticeReviewDraft(input, url, invalid), error);
  assert.equal(saved, undefined);
  assert.match(await latticeReviewDraft(input, url, answered), /Saved 4 draft/);
  assert.deepEqual(
    saved.map((u) => u.content),
    [
      { body: "**Émilia** &amp; Jo\n\n<br>\n\n- helped\n- shipped" },
      { body: "Existing comment", multipleSelect: ["1"] },
      { rating: "2" },
      { multipleSelect: ["0", "1"] },
    ],
  );
  await assert.rejects(stat(script), { code: "ENOENT" });
  for (const field of ["lockedAt", "closedAt", "isRejected", "submittedAt"]) {
    r[field] = true;
    await assert.rejects(latticeReviewDraft(input, url, answered), /not open/);
    r[field] = null;
  }
  r.viewerIsResponder = false;
  await assert.rejects(latticeReviewDraft(input, url, answered), /not your review/);
  await assert.rejects(
    latticeReviewDraft(input, url.replace(origin, "https://bad.test"), answered),
    /Expected a Lattice/,
  );
});

test("the pending list follows pagination and excludes closed, submitted, declined and other people's assignments", async () => {
  const { listLatticeReviewRequests } = await import("provider-lattice");
  const row = (n, overrides) => ({
    entityId: id(n),
    status: "IN_PROGRESS",
    viewerIsResponder: true,
    reviewee: { user: { name: "Reviewer " + n } },
    reviewGroup: { type: "peer" },
    ...overrides,
  });
  const input = runtime((_, v) => ({
    viewer: {
      cycle: {
        canReviewsBeWritten: true,
        groups: [
          {
            id: "a",
            requests: v.after
              ? page([row(8, {})])
              : page(
                  [
                    row(3, {}),
                    row(4, { submittedAt: "yesterday" }),
                    row(5, { isRejected: true }),
                    row(6, { closedAt: "today" }),
                    row(7, { viewerIsResponder: false }),
                  ],
                  "cursor",
                ),
          },
        ],
      },
    },
  }));
  const result = await listLatticeReviewRequests(
    input,
    origin + "/reviews/" + id(1) + "/participant/requests?back=%2F",
  );
  assert.equal(result.split("\n").length, 2);
  assert.match(result, /Reviewer 3/);
  assert.match(result, /Reviewer 8/);
});

test("draft sync keeps local files, posts only edited answers and detects remote conflicts", async () => {
  const { syncLatticeDrafts } = await import("provider-lattice");
  const { tmpdir } = await import("node:os");
  const { mkdtemp, readFile, writeFile, readdir, rm } = await import("node:fs/promises");
  const parent = await mkdtemp(tmpdir() + "/lattice-draft-test-");
  const dir=parent+"/lattice-drafts-2026";
  const reqs = origin + "/reviews/" + id(1) + "/participant/requests";
  const r = {
    entityId: id(2),
    status: "UNBEGUN",
    submittedAt: null,
    viewerIsResponder: true,
    reviewGroup: { type: "peer", reviewTemplate: { name: "Winter peer", instructions: null } },
    reviewee: {
      user: { name: "Jo Li" },
      reviewCycle: { name: "Winter", entityId: id(1), canReviewsBeWritten: true },
    },
    questions: [
      {
        id: id(3),
        description: "Example",
        revision: { body: "Impact?", __typename: "BodyQuestionRevision", question: { isOptional: true } },
        reviewResponse: { content: { body: "Existing **draft**" } },
      },
    ],
  };
  let open = true,
    writes = 0;
  const input = runtime((q) =>
    q.includes("name createdAt") ? {viewer:{cycle:{name:"Winter 2026",createdAt:"2025-12-01"}}} : q.includes("viewerReviewGroupsToRespond")
      ? {
          viewer: {
            cycle: { canReviewsBeWritten: true, groups: [{ id: "group", requests: page(open ? [r] : []) }] },
          },
        }
      : { viewer: { r } },
  );
  const run = input.process.execute.bind(input.process);
  input.process.execute = async (cmd, args) => {
    const f = args.find((v) => v.startsWith("--filename="));
    if (!f) return run(cmd, args);
    const code = await readFile(f.slice(11), "utf8");
    const result = await Function("return (" + code + ")")()({
      request: {
        post: async (_url, { data }) => {
          assert.match(data.query, /^mutation SaveDraftReviewResponsesMutation/);
          const [one] = data.variables.input.reviewRequestQuestions;
          writes++;
          r.questions[0].reviewResponse.content = one.content;
          return {
            json: async () => ({
              data: {
                saveDraftReviewResponses: {
                  results: [
                    {
                      reviewRequest: { entityId: id(2), submittedAt: null },
                      reviewRequestQuestion: {
                        id: one.reviewRequestQuestionId,
                        reviewResponse: { content: one.content },
                      },
                    },
                  ],
                },
              },
            }),
          };
        },
      },
    });
    return { stdout: JSON.stringify(result), stderr: "" };
  };
  try {
    assert.match(await syncLatticeDrafts(input, reqs, parent), /1 placeholder\(s\) created/);
    const path = dir + "/" + (await readdir(dir)).find((f) => f.endsWith(".md"));
    assert.equal(JSON.parse(await readFile(dir+"/.wire-lattice-drafts.json","utf8")).source,reqs);
    const first = await readFile(path, "utf8");
    assert.match(first, /Existing \*\*draft\*\*/);
    assert.equal(writes, 0);
    r.questions.push({
      ...r.questions[0],
      id: id(7),
      revision: { ...r.questions[0].revision, body: "Anything else?" },
      reviewResponse: null,
    });
    const full = await (
      await import("provider-lattice")
    ).latticeReviewDraft(input, origin + "/reviews/" + id(1) + "/participant/response/" + id(2));
    await writeFile(path, full.replace("\n\n<answer: write here>", ""));
    assert.match(await syncLatticeDrafts(input, undefined, dir), /1 template\(s\) refreshed/);
    assert.equal(await readFile(path, "utf8"), full);
    assert.equal(writes, 0);
    const edited = full.replace("Existing **draft**", "Updated **draft**");
    await writeFile(path, edited);
    await syncLatticeDrafts(input, undefined, dir);
    assert.equal(writes, 1);
    assert.equal(r.questions[0].reviewResponse.content.body, "Updated **draft**");
    await syncLatticeDrafts(input, undefined, dir);
    assert.equal(writes, 1);
    r.questions[0].reviewResponse.content.body = "Changed in browser";
    await syncLatticeDrafts(input, undefined, dir);
    assert.equal(writes, 1);
    await writeFile(path, edited.replace("Updated **draft**", "Another local edit"));
    await assert.rejects(syncLatticeDrafts(input, undefined, dir), /Draft conflict/);
    assert.equal(writes, 1);
    open = false;
    await syncLatticeDrafts(input, undefined, dir);
    assert.match(await readFile(path, "utf8"), /Another local edit/);
  } finally {
    await rm(parent, { recursive: true });
  }
});

test("choice inputs use live labels, validate booleans and preserve an explicit false", async () => {
  const { latticeReviewDraft } = await import("provider-lattice");
  const { readFile } = await import("node:fs/promises");
  const url = origin + "/reviews/" + id(1) + "/participant/response/" + id(2);
  const revision = {
    __typename: "MultipleChoiceAndBodyQuestionRevision",
    body: "Share?",
    choices: ["No", "Yes"],
    question: { isOptional: true },
  };
  const q = { id: id(4), revision, description: null, reviewResponse: null };
  const r = {
    entityId: id(2),
    viewerIsResponder: true,
    reviewGroup: { reviewTemplate: { name: "Peer" } },
    reviewee: {
      user: { name: "Jo" },
      reviewCycle: { name: "Winter", entityId: id(1), canReviewsBeWritten: true },
    },
    questions: [q],
  };
  const inp = runtime(() => ({ viewer: { r } }));
  const exec = inp.process.execute.bind(inp.process);
  let calls = 0,
    content;
  inp.process.execute = async (c, a) => {
    const file = a.find((s) => s.startsWith("--filename="));
    if (!file) return exec(c, a);
    const program = await readFile(file.slice(11), "utf8");
    const result = await Function("return (" + program + ")")()({
      request: {
        post: async (_, v) => {
          content = v.data.variables.input.reviewRequestQuestions[0].content;
          calls++;
          return {
            json: async () => ({
              data: {
                saveDraftReviewResponses: {
                  errors: [],
                  results: [
                    {
                      reviewRequest: { entityId: id(2), submittedAt: null },
                      reviewRequestQuestion: { id: id(4), reviewResponse: { content } },
                    },
                  ],
                },
              },
            }),
          };
        },
      },
    });
    return { stdout: JSON.stringify(result), stderr: "" };
  };
  const fill = (s) => latticeReviewDraft(inp, url, "## Share?\n\n" + s);
  for (const [value, idx] of [
    ["false", "0"],
    ["NO", "0"],
    ["Selected: False", "0"],
    ["TrUe", "1"],
    ["yes", "1"],
  ]) {
    await fill(value);
    assert.deepEqual(content, { multipleSelect: [idx] });
  }
  await fill("false\n\nOnly share **anonymously**.");
  assert.deepEqual(content, { multipleSelect: ["0"], body: "Only share **anonymously**." });
  for (const value of ["maybe", "Selected: unknown", "true\nfalse", "yes\nYes", "Rating: true"]) {
    const n = calls;
    await assert.rejects(fill(value), /choice/);
    assert.equal(calls, n);
  }
  revision.choices = ["Definitely Yes", "Yes", "Sort of", "No", "Definitely Not"];
  await assert.rejects(fill("true"), /Invalid choice/);
  await fill("sort OF");
  assert.deepEqual(content, { multipleSelect: ["2"] });
  revision.__typename = "MultipleSelectQuestionRevision";
  revision.choices = ["A", "B", "C"];
  revision.question.maximumSelection = 2;
  await fill("- [x] C\n- [ ] B\n- [x] A");
  assert.deepEqual(content, { multipleSelect: ["2", "0"] });
  await fill("B\nA");
  assert.deepEqual(content, { multipleSelect: ["1", "0"] });
  await assert.rejects(fill("A\nB\nC"), /number of choices/);
  revision.__typename = "RatingAndBodyQuestionRevision";
  delete revision.choices;
  revision.scale = ["Learning", "Strong"];
  await fill("strong\n\nUseful examples.");
  assert.deepEqual(content, { rating: "2", body: "Useful examples." });
  await assert.rejects(fill("Average"), /Invalid choice/);
});

test("every editable field has a visible placeholder that never becomes draft content", async () => {
  const { latticeReviewDraft } = await import("provider-lattice");
  const { readFile } = await import("node:fs/promises");
  const url = origin + "/reviews/" + id(1) + "/participant/response/" + id(2);
  const q = (n, t, values) => ({
    id: id(n),
    revision: { __typename: t + "QuestionRevision", body: "Item " + n, question: { isOptional: true }, ...values },
    reviewResponse: null,
  });
  const questions = [
    q(3, "Body"),
    q(4, "MultipleChoiceAndBody", { choices: ["Yes", "No"] }),
    q(5, "MultipleSelect", { choices: ["A", "B"] }),
    q(6, "Rating", { scale: ["High"] }),
  ];
  const r = {
    entityId: id(2),
    viewerIsResponder: true,
    reviewGroup: { reviewTemplate: { name: "Feedback" } },
    reviewee: { user: { name: "Lee" }, reviewCycle: { entityId: id(1), canReviewsBeWritten: true } },
    questions,
  };
  const input = runtime(() => ({ viewer: { r } })),
    execute = input.process.execute.bind(input.process);
  let saved = [];
  input.process.execute = async (cmd, args) => {
    const file = args.find((arg) => arg.startsWith("--filename="));
    if (!file) return execute(cmd, args);
    const program = await readFile(file.slice(11), "utf8");
    assert.doesNotMatch(program, /(?:<|&lt;)(?:answer|choice|choices|rating|comment):/);
    const result = await Function("return (" + program + ")")()({
      request: {
        post: async (_url, { data }) => {
          saved = data.variables.input.reviewRequestQuestions;
          return {
            json: async () => ({
              data: {
                saveDraftReviewResponses: {
                  results: saved.map((u) => ({
                    reviewRequest: { entityId: id(2), submittedAt: null },
                    reviewRequestQuestion: {
                      id: u.reviewRequestQuestionId,
                      reviewResponse: { content: u.content },
                    },
                  })),
                },
              },
            }),
          };
        },
      },
    });
    return { stdout: JSON.stringify(result), stderr: "" };
  };
  const template = await latticeReviewDraft(input, url);
  for (const mark of [
    "<answer: write here>",
    "<choice: pick one>",
    "<comment: write here>",
    "<choices: pick one or more>",
    "<rating: pick one>",
  ])
    assert.ok(template.includes(mark));
  assert.equal(await latticeReviewDraft(input, url, template), "No draft changes.");
  assert.equal(saved.length, 0);
  await latticeReviewDraft(input, url, template.replace("<comment: write here>", "TBD"));
  assert.deepEqual(
    saved.map((u) => u.content),
    [{ body: "TBD" }],
  );
  await latticeReviewDraft(input, url, template.replace("<choice: pick one>", "false"));
  assert.deepEqual(
    saved.map((u) => u.content),
    [{ multipleSelect: ["1"] }],
  );
  await assert.rejects(
    latticeReviewDraft(input, url, template.replace("<choice: pick one>", "maybe")),
    /Invalid choice/,
  );
  await assert.rejects(
    latticeReviewDraft(input, url, template.replace("<answer: write here>", "text <answer: write here>")),
    /whole placeholder/,
  );
  await assert.rejects(
    latticeReviewDraft(input, url, template.replace("<answer: write here>", "text &lt;answer: write here&gt;")),
    /placeholder/,
  );
});
