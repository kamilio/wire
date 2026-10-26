import { describe, expect, it } from "vitest";
import { markdownToSlackBlocks, slackBlocksToMarkdown, sendSlackMessage, editSlackMessage, lookupSlackUsers, slackService } from "../packages/provider-slack/src/slack.js";
import type { JsonObject, RuntimeCapabilities } from "wire-core";

const users = new Map<string, string>();
const section = (elements: JsonObject[]) => [{ type: "rich_text", elements: [{ type: "rich_text_section", elements }] }];
const text = (value: string, style: JsonObject) => ({ type: "text", text: value, style });
const roundtrip = (markdown: string) => markdownToSlackBlocks(slackBlocksToMarkdown(markdownToSlackBlocks(markdown), users));

function runtime(handler: (method: string, params: URLSearchParams) => JsonObject) {
  const calls: { method: string; params: URLSearchParams }[] = [];
  const value = {
    cookies: { loadSaved: async () => [{ name: "d", value: "secret" }], metadata: async () => ({ origin: "https://example.slack.com", token: "token" }) },
    clock: { localTimezone: () => "UTC" },
    http: { request: async (url: string, init: RequestInit) => { const method = url.split("/api/")[1]!; const params = new URLSearchParams(init.body as string); calls.push({ method, params }); return new Response(JSON.stringify(handler(method, params))); } },
  } as unknown as RuntimeCapabilities;
  return { value, calls };
}

describe("Markdown to native Slack rich text", () => {
  it.each([
    ["**bold**", { bold: true }],
    ["_italic_", { italic: true }],
    ["~~strike~~", { strike: true }],
    ["***both***", { bold: true, italic: true }],
    ["~~**combined**~~", { bold: true, strike: true }],
    ["`code`", { code: true }],
  ])("converts %s to native styles", (markdown, style) => {
    expect(markdownToSlackBlocks(markdown)[0]!["elements"]).toEqual([{ type: "rich_text_section", elements: [text(markdown.replace(/[*_~`]/g, ""), style)] }]);
  });

  it.each([
    "**bold** and _italic_ and ~~strike~~",
    "**bold _nested italic_ bold**",
    "***bold italic*** and ~~**strike bold**~~",
    "Plain & < > \\*literal\\* \\[brackets\\] \\_underscore\\_",
    "`literal **not bold** <@U1> &amp;`",
    "`` one ` tick ``",
    "```ts\nconst x = '<@U1>';\nconst marker = '**literal**';\n```",
    "````\n```nested fence```\n````",
    "[a link](https://example.com/a_(b)?x=1&y=2)",
    "- first\n- second\n  - nested\n  - sibling\n- last",
    "3. third\n4. fourth\n   - child\n5. fifth",
    "> **quoted** and `code`\n> next line",
    "<@U123> <#C123> <!here> <!subteam^S123>",
    "Unicode 👩🏽‍💻 café 中文 and emoji 🎉",
    "before  \nafter",
    "**one** **two**",
    "prefix**bold**suffix",
    "**bold**_italic_~~strike~~",
  ])("preserves native content and formatting through Markdown: %s", (markdown) => {
    expect(roundtrip(markdown)).toEqual(markdownToSlackBlocks(markdown));
  });

  it("preserves code containing trailing newlines and triple backticks", () => {
    const blocks = [{ type: "rich_text", elements: [{ type: "rich_text_preformatted", elements: [{ type: "text", text: "```\ncode\n```\n" }] }] }];
    expect(markdownToSlackBlocks(slackBlocksToMarkdown(blocks, users))).toEqual(blocks);
  });

  it("keeps frontmatter and tables visible", () => {
    const blocks = markdownToSlackBlocks("---\ntitle: café\n---\n\n| A | B |\n| - | - |\n| x | y |");
    expect(JSON.stringify(blocks)).toContain("title: café");
    expect(JSON.stringify(blocks)).toContain("| x | y |");
  });

  it("renders a heading as bold text and tasks as visible checkboxes", () => {
    expect(markdownToSlackBlocks("# Heading")).toEqual(section([text("Heading", { bold: true })]));
    expect(JSON.stringify(markdownToSlackBlocks("- [x] done\n- [ ] todo"))).toContain("☑ ");
    expect(JSON.stringify(markdownToSlackBlocks("- [x] done\n- [ ] todo"))).toContain("☐ ");
  });

  it("preserves raw HTML as literal text", () => {
    expect(JSON.stringify(markdownToSlackBlocks("<script>alert(1)</script>"))).toContain("<script>alert(1)</script>");
  });

  it("rejects empty and oversized messages before networking", async () => {
    const mocked = runtime(() => { throw new Error("must not request"); });
    for (const markdown of ["", " \n", "x".repeat(40001)]) await expect(sendSlackMessage(mocked.value, "C1", markdown)).rejects.toThrow();
    expect(mocked.calls).toEqual([]);
  });
});

describe("native Slack to Markdown", () => {
  it.each(["---", "===", "#", "# heading", "- list", "+ list", "1. numbered", "2) numbered", "*literal*", "_literal_", "~literal~", "[link](url)", "<@U1>", "\\path", "&amp;", "foo_bar_baz", "a\nb", " leading "]) ("roundtrips literal text %s", (value) => {
    const markdown = slackBlocksToMarkdown(section([text(value, {})]), users);
    expect(markdownToSlackBlocks(markdown)).toEqual(section([text(value, {})]));
  });

  it("resolves mention names while retaining IDs for sending", () => {
    const blocks = section([{ type: "user", user_id: "U1", style: {} }]);
    const markdown = slackBlocksToMarkdown(blocks, new Map([["U1", "Alice [QA]"]]));
    expect(markdown).toContain("Alice \\[QA\\]");
    expect(markdownToSlackBlocks(markdown)).toEqual(blocks);
  });

  it("renders bot blocks, images, and buttons", () => {
    expect(slackBlocksToMarkdown([
      { type: "header", text: { type: "plain_text", text: "Report" } },
      { type: "section", fields: [{ type: "plain_text", text: "Field" }, { type: "plain_text", text: "Value" }] },
      { type: "image", image_url: "https://example.com/image.png", alt_text: "Image" },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open" }, url: "https://example.com" }] },
    ], users)).toContain("[Open](<https://example.com>)");
  });
});

describe("Slack sending and reading", () => {
  it("paginates channel names and posts native blocks without unfurling", async () => {
    const mocked = runtime((method, params) => {
      if (method === "search.modules.channels") return params.get("page") === "2" ? { items: [{ id: "C1", name: "kamil-reviews" }], pagination: { page_count: 2 } } : { items: [{ id: "C2", name: "kamil-reviews-other" }], pagination: { page_count: 2 } };
      if (method === "chat.postMessage") { expect(params.get("channel")).toBe("C1"); expect(JSON.parse(params.get("blocks")!)).toEqual(markdownToSlackBlocks("**Hello**")); expect(params.get("unfurl_links")).toBe("false"); expect(params.has("thread_ts")).toBe(false); return { ok: true, channel: "C1", ts: "1234567890.000001" }; }
      throw new Error(method);
    });
    expect(await sendSlackMessage(mocked.value, "#kamil-reviews", "**Hello**")).toMatchObject({ channel: "C1", ts: "1234567890.000001" });
    expect(mocked.calls.map((call) => call.method)).toEqual(["search.modules.channels", "search.modules.channels", "chat.postMessage"]);
  });

  it.each(["U1", "W1"])("opens a DM for user ID %s before posting", async (user) => {
    const mocked = runtime((method, params) => {
      if (method === "conversations.open") { expect(params.get("users")).toBe(user); return { channel: { id: "D1" } }; }
      if (method === "chat.postMessage") { expect(params.get("channel")).toBe("D1"); return { channel: "D1", ts: "1234567890.000001" }; }
      throw new Error(method);
    });
    expect(await sendSlackMessage(mocked.value, user, "Hello")).toMatchObject({ channel: "D1" });
    expect(mocked.calls.map((call) => call.method)).toEqual(["conversations.open", "chat.postMessage"]);
  });

  it("resolves an exact @username across pages before opening a DM", async () => {
    const mocked = runtime((method, params) => {
      if (method === "users.list") return params.get("cursor") === "next" ? { members: [{ id: "U1", name: "alice" }], response_metadata: { next_cursor: "" } } : { members: [{ id: "U2", name: "alice-other" }, { id: "U3", name: "alice", deleted: true }], response_metadata: { next_cursor: "next" } };
      if (method === "conversations.open") { expect(params.get("users")).toBe("U1"); return { channel: { id: "D1" } }; }
      if (method === "chat.postMessage") { expect(params.get("channel")).toBe("D1"); return { channel: "D1", ts: "1234567890.000001" }; }
      throw new Error(method);
    });
    expect(await sendSlackMessage(mocked.value, "@alice", "Hello")).toMatchObject({ channel: "D1" });
    expect(mocked.calls.map((call) => call.method)).toEqual(["users.list", "users.list", "conversations.open", "chat.postMessage"]);
  });

  it.each([{ members: [] }, { members: [{ id: "U1", name: "alice" }, { id: "U2", name: "alice" }] }])("does not send to missing or ambiguous users", async ({ members }) => {
    const mocked = runtime(() => ({ members }));
    await expect(sendSlackMessage(mocked.value, "@alice", "Hello")).rejects.toThrow("Expected one Slack user");
    expect(mocked.calls.map((call) => call.method)).toEqual(["users.list"]);
  });

  it("does not post when opening a DM fails", async () => {
    const mocked = runtime(() => ({ ok: false, error: "user_not_found" }));
    await expect(sendSlackMessage(mocked.value, "U1", "Hello")).rejects.toThrow("user_not_found");
    expect(mocked.calls.map((call) => call.method)).toEqual(["conversations.open"]);
  });

  it("replies to a thread URL", async () => {
    const mocked = runtime((method, params) => {
      if (method === "conversations.replies") return { messages: [{ ts: "1234567890.000001" }] };
      if (method === "chat.postMessage") { expect(params.get("thread_ts")).toBe("1234567890.000001"); return { channel: "C1", ts: "1234567891.000001" }; }
      throw new Error(method);
    });
    expect(await sendSlackMessage(mocked.value, "https://example.slack.com/archives/C1/p1234567890000001", "Reply")).toMatchObject({ thread_ts: "1234567890.000001" });
  });

  it("reports Slack failures and never retries posting", async () => {
    const mocked = runtime(() => ({ ok: false, error: "not_in_channel" }));
    await expect(sendSlackMessage(mocked.value, "C1", "Hi")).rejects.toThrow("not_in_channel");
    expect(mocked.calls).toHaveLength(1);
  });

  it.each(["https://example.slack.com/archives/C1", "https://app.slack.com/client/T1/C1"]) ("recognizes channel URLs %s", (url) => {
    expect(slackService.matches(new URL(url))).toBe(true);
    expect(slackService.parse(new URL(url))).toMatchObject({ channel_id: "C1", identifier: "C1" });
  });

  it("reads paginated channel history in chronological order with native formatting", async () => {
    const mocked = runtime((method, params) => {
      if (method === "conversations.history") return params.has("cursor") ? { messages: [{ ts: "1234567890.000001", username: "Bot", text: "old" }], response_metadata: { next_cursor: "" } } : { messages: [{ ts: "1234567891.000001", username: "Bot", text: "new", blocks: section([text("new", { bold: true })]) }], response_metadata: { next_cursor: "next" } };
      throw new Error(method);
    });
    const url = "https://example.slack.com/archives/C1";
    const fetched = await slackService.fetch(mocked.value, url, slackService.parse(new URL(url)));
    expect(fetched.markdown).toContain("**new**");
    expect(fetched.markdown.indexOf("old")).toBeLessThan(fetched.markdown.indexOf("**new**"));
  });
});

describe("Slack conversion regressions", () => {
  it("does not look up literal mentions inside native code", async () => {
    const mocked = runtime((method) => {
      expect(method).toBe("conversations.replies");
      return { messages: [{ ts: "1234567890.000001", username: "Bot", text: "`<@U404>`", blocks: section([text("<@U404>", { code: true })]) }] };
    });
    const url = "https://example.slack.com/archives/C1/p1234567890000001";
    expect((await slackService.fetch(mocked.value, url, slackService.parse(new URL(url)))).markdown).toContain("`<@U404>`");
  });

  it("keeps escaped mentions literal beside real mentions", () => {
    expect(markdownToSlackBlocks("\\<@U1> and <@U1>")).toEqual(section([text("<@U1> and ", {}), { type: "user", user_id: "U1", style: {} }]));
  });

  it.each(["**a**_b_", "_a_**b**", "**a _b_ c**", "~~_a **b** c_~~", "**a**\\*b\\***c**", "a**b**c", "a_b_c", "[**styled** link](https://example.com)"])("preserves mixed formatting: %s", (markdown) => {
    expect(roundtrip(markdown)).toEqual(markdownToSlackBlocks(markdown));
  });

  it.each(["unclosed **bold", "unclosed `code", "[broken](", "\\", "````\n```", "~~~js\nconsole.log(1)\n~~~", "[link](<https://example.com/a)b>)", "# café\r\n\r\n| A | B |\r\n| - | - |\r\n| é | x |"])("does not lose malformed or escaped content: %s", (markdown) => {
    expect(roundtrip(markdown)).toEqual(markdownToSlackBlocks(markdown));
  });

  for (const bold of [false, true]) for (const italic of [false, true]) for (const strike of [false, true]) for (const code of [false, true]) {
    it(`roundtrips combined native styles ${JSON.stringify({ bold, italic, strike, code })}`, () => {
      const style = Object.fromEntries(Object.entries({ bold, italic, strike, code }).filter(([, value]) => value));
      const blocks = section([text("A [bracket] *star* _word_ `tick` & café", style)]);
      expect(markdownToSlackBlocks(slackBlocksToMarkdown(blocks, users))).toEqual(blocks);
    });
  }

  it("uses the parent timestamp from reply permalinks", async () => {
    const mocked = runtime((method, params) => {
      if (method === "conversations.replies") { expect(params.get("ts")).toBe("1234567890.000001"); return { messages: [{ ts: "1234567890.000001", thread_ts: "1234567890.000001" }] }; }
      if (method === "chat.postMessage") { expect(params.get("thread_ts")).toBe("1234567890.000001"); return { channel: "C1", ts: "1234567892.000001" }; }
      throw new Error(method);
    });
    await sendSlackMessage(mocked.value, "https://example.slack.com/archives/C1/p1234567891000001?thread_ts=1234567890.000001", "Reply to reply");
  });

  it("reads channel threads with pagination without duplicating the parent", async () => {
    const parent = { ts: "1234567890.000001", username: "Bot", text: "parent", reply_count: 2 };
    const mocked = runtime((method, params) => {
      if (method === "conversations.history") return { messages: [parent] };
      if (method === "conversations.replies") return params.has("cursor") ? { messages: [{ ts: "1234567892.000001", thread_ts: parent.ts, username: "Bot", text: "last reply" }], response_metadata: { next_cursor: "" } } : { messages: [parent, { ts: "1234567891.000001", thread_ts: parent.ts, username: "Bot", text: "first reply" }], response_metadata: { next_cursor: "page2" } };
      throw new Error(method);
    });
    const url = "https://example.slack.com/archives/C1";
    const fetched = await slackService.fetch(mocked.value, url, slackService.parse(new URL(url)));
    expect(fetched.markdown.match(/parent/g)).toHaveLength(1);
    expect(fetched.markdown).toContain("last reply");
    expect(fetched.markdown).toContain("[Thread](https://example.slack.com/archives/C1/p1234567890000001)");
  });

  it("renders legacy bot attachments", async () => {
    const mocked = runtime(() => ({ messages: [{ ts: "1234567890.000001", username: "Bot", text: "", attachments: [{ title: "Build", title_link: "https://example.com", text: "*Passed*", fields: [{ title: "Commit", value: "`abc`" }] }] }] }));
    const url = "https://example.slack.com/archives/C1/p1234567890000001";
    const fetched = await slackService.fetch(mocked.value, url, slackService.parse(new URL(url)));
    expect(fetched.markdown).toContain("[Build](<https://example.com>)");
    expect(fetched.markdown).toContain("**Passed**");
    expect(fetched.markdown).toContain("**Commit**: `abc`");
  });
});

describe("Slack links and message boundaries", () => {
  it("retains styles within a link label", () => {
    expect(markdownToSlackBlocks("[**bold** and _italic_](https://example.com)")).toEqual(section([
      { type: "link", url: "https://example.com", text: "bold", style: { bold: true } },
      { type: "link", url: "https://example.com", text: " and ", style: {} },
      { type: "link", url: "https://example.com", text: "italic", style: { italic: true } },
    ]));
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "file:///private/file"])("rejects unsupported link protocols: %s", (url) => {
    expect(() => markdownToSlackBlocks(`[link](<${url}>)`)).toThrow("Unsupported Slack link protocol");
  });
  it.each(["https://evil.example/archives/C1/p1234567890000001", "https://example.slack.com.evil.test/archives/C1/p1234567890000001"])("does not send to non-Slack URLs: %s", async (url) => {
    const mocked = runtime(() => { throw new Error("Unexpected request"); });
    await expect(sendSlackMessage(mocked.value, url, "Hello")).rejects.toThrow("Unsupported Slack destination");
    expect(mocked.calls).toEqual([]);
  });
  it("does not reinterpret code or escaped syntax in notification text", async () => {
    const mocked = runtime((method, params) => {
      if (method === "chat.postMessage") { expect(params.get("mrkdwn")).toBe("false"); expect(params.get("parse")).toBe("none"); return { channel: "C1", ts: "1234567890.000001" }; }
      throw new Error(method);
    });
    await sendSlackMessage(mocked.value, "C1", "`<@U1>` and \\<@U1\\>");
  });
});


it("escapes literal Markdown in native link labels", () => {
  const blocks = section([{ type: "link", url: "https://example.com", text: "*literal* _label_ [QA]", style: {} }]);
  expect(markdownToSlackBlocks(slackBlocksToMarkdown(blocks, users))).toEqual(blocks);
});


it("does not turn escaped legacy mention text into a live mention", () => {
  const markdown = slackBlocksToMarkdown([{ type: "mrkdwn", text: "&lt;@U1&gt; and &amp;lt;" }], users);
  expect(markdown).toBe("\\<@U1\\> and &lt;");
  expect(markdownToSlackBlocks(markdown)).toEqual(section([text("<@U1> and &lt;", {})]));
});


it("sends to workspace permalinks using an Enterprise session without forwarding credentials", async () => {
  const mocked = runtime((method, params) => {
    if (method === "conversations.replies") return { messages: [{ ts: "1234567890.000001" }] };
    if (method === "chat.postMessage") { expect(params.get("channel")).toBe("C1"); return { channel: "C1", ts: "1234567891.000001" }; }
    throw new Error(method);
  });
  await expect(sendSlackMessage(mocked.value, "https://example.enterprise.slack.com/archives/C1/p1234567890000001", "Reply")).resolves.toMatchObject({ thread_ts: "1234567890.000001" });
});


describe("email lookup, mentions, and threads", () => {
  it("looks up exact emails and paginates name matches without choosing one", async () => {
    const mocked = runtime((method, params) => {
      if (method === "users.list") return params.has("cursor") ? { members: [{ id: "U2", real_name: "Alice Jones" }], response_metadata: { next_cursor: "" } } : { members: [{ id: "U1", real_name: "Alice Smith", profile: { email: "alice@example.com" } }, { id: "U3", real_name: "Alice Old", deleted: true }], response_metadata: { next_cursor: "next" } };
      throw new Error(method);
    });
    expect(await lookupSlackUsers(mocked.value, "alice@example.com")).toMatchObject([{ id: "U1" }]);
    expect(await lookupSlackUsers(mocked.value, "alice")).toMatchObject([{ id: "U1" }, { id: "U2" }]);
  });

  it("resolves repeated email mentions once before posting any thread section", async () => {
    const markdown = "**Hello [@Alice](mailto:alice@example.com)**\n\n---\n\n- [@Alice](mailto:alice@example.com)\n- [Email](mailto:alice@example.com)\n- `[@Alice](mailto:alice@example.com)`";
    let posted = 0;
    const mocked = runtime((method, params) => {
      if (method === "users.list") return { members: [{ id: "U1", profile: { email: "alice@example.com" } }] };
      if (method === "chat.postMessage") {
        posted += 1;
        const blocks = JSON.parse(params.get("blocks")!);
        expect(JSON.stringify(blocks)).toContain('"type":"user","user_id":"U1"');
        if (posted === 1) { expect(params.has("thread_ts")).toBe(false); expect(JSON.stringify(blocks)).toContain('"bold":true'); }
        else { expect(params.get("thread_ts")).toBe("1234567890.000001"); expect(JSON.stringify(blocks)).toContain('"url":"mailto:alice@example.com","text":"Email"'); expect(JSON.stringify(blocks)).toContain('"code":true'); }
        return { channel: "C1", ts: `1234567890.00000${posted}` };
      }
      throw new Error(method);
    });
    const result = await sendSlackMessage(mocked.value, "C1", markdown);
    expect(result.replies).toHaveLength(1);
    expect(mocked.calls.map((call) => call.method)).toEqual(["users.list", "chat.postMessage", "chat.postMessage"]);
  });

  it("rejects an unresolved mention in a later section before writing", async () => {
    const mocked = runtime(() => ({ members: [] }));
    await expect(sendSlackMessage(mocked.value, "C1", "First\n\n---\n\n[@Unknown](mailto:missing@example.com)")).rejects.toThrow("Expected one Slack user");
    expect(mocked.calls.map((call) => call.method)).toEqual(["users.list"]);
  });

  it.each(["```\n---\n```", "---\ntitle: metadata\n---\n\nBody", "> ---", "- list\n\n  ---", "Heading\n---", "Before\n\n***\n\nAfter"])("does not split non-separator Markdown: %s", async (markdown) => {
    const mocked = runtime((method) => { expect(method).toBe("chat.postMessage"); return { channel: "C1", ts: "1234567890.000001" }; });
    const result = await sendSlackMessage(mocked.value, "C1", markdown);
    expect(result.replies).toBeUndefined();
    expect(mocked.calls).toHaveLength(1);
  });

  it("edits the selected reply, then appends sections to its parent thread", async () => {
    const mocked = runtime((method, params) => {
      if (method === "conversations.replies") return { messages: [{ ts: "1234567890.000001" }] };
      if (method === "chat.update") { expect(params.get("ts")).toBe("1234567891.000001"); expect(params.has("thread_ts")).toBe(false); return { channel: "C1", ts: "1234567891.000001" }; }
      if (method === "chat.postMessage") { expect(params.get("thread_ts")).toBe("1234567890.000001"); return { channel: "C1", ts: "1234567892.000001" }; }
      throw new Error(method);
    });
    const result = await editSlackMessage(mocked.value, "https://example.slack.com/archives/C1/p1234567891000001?thread_ts=1234567890.000001", "Edited\n\n---\n\nAdded");
    expect(result.replies).toHaveLength(1);
    expect(mocked.calls.map((call) => call.method)).toEqual(["conversations.replies", "chat.update", "chat.postMessage"]);
  });

  it("reports completed messages on a partial failure without retrying", async () => {
    let posted = 0;
    const mocked = runtime(() => ++posted === 1 ? { channel: "C1", ts: "1234567890.000001" } : { ok: false, error: "rate_limited" });
    await expect(sendSlackMessage(mocked.value, "C1", "First\n\n---\n\nSecond\n\n---\n\nThird")).rejects.toThrow("https://example.slack.com/archives/C1/p1234567890000001");
    expect(mocked.calls).toHaveLength(2);
  });
});
