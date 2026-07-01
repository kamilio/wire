import assert from "node:assert/strict";
import { test } from "node:test";

import { composeAuth, createCookiesCapability, parseNetscapeCookies } from "../dist/index.js";

const cookie = (name, value, domain) => Object.freeze({ domain, includeSubdomains: true, path: "/", secure: true, expires: 0, name, value, httpOnly: true });
const notionCookies = Object.freeze([cookie("token_v2", "token", ".notion.so"), cookie("notion_user_id", "user", ".notion.so"), cookie("notion_users", "%5B%22user%22%5D", ".notion.so")]);
const asanaCookies = Object.freeze([cookie("ticket", "session", ".asana.com")]);
const slackCookies = Object.freeze([cookie("d", "session", ".slack.com")]);
const slackMetadata = Object.freeze({ origin: "https://workspace.slack.com", token: "xoxc-session-token" });
const zoomCookies = Object.freeze([cookie("zm_aid", "account", ".zoom.us"), cookie("_zm_ssid", "session", ".zoom.us")]);
const chatgptCookies = Object.freeze([cookie("oai-did", "device", ".chatgpt.com"), cookie("__Secure-next-auth.session-token", "session", ".chatgpt.com")]);
const googleCookies = Object.freeze([cookie("SID", "session", ".google.com")]);

function json(value, url = "") {
  const response = new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  return Object.defineProperty(response, "url", { value: url });
}

function text(value, url = "") {
  const response = new Response(value);
  return Object.defineProperty(response, "url", { value: url });
}

function runtime(files, requests, writes) {
  return Object.freeze({
    http: Object.freeze({ request: async (input, init) => {
      const url = input.toString();
      requests.push(url);
      if (url.includes("notion.so/api/v3/getSpaces")) return json({ user: { space_view: { view: { spaceId: "space" } } } });
      if (url === "https://workspace.slack.com/") return text('"xoxc-session-token"', "https://workspace.slack.com/");
      if (url.includes("/api/auth.test")) return json({ ok: init.body.get("token") === "xoxc-session-token", ...(init.body.get("token") === "xoxc-session-token" ? { user_id: "U1", user: "person", team_id: "T1", team: "Workspace", url: "https://workspace.slack.com/" } : { error: "invalid_auth" }) });
      if (url === "https://zoom.us/csrf_js") return text("csrf: token");
      if (url.includes("hub.zoom.us/nws/common")) return text("a.b.c");
      if (url === "https://chatgpt.com/api/auth/session") return json({ accessToken: "token", account: { id: "account" } });
      if (url.includes("asana.com/api/1.0/users/me")) return json({ data: { gid: "1", name: "Person", email: "person@example.com" } });
      if (url.includes("accounts.google.com/ListAccounts")) return text('["person@example.com"]');
      if (url === "https://docs.google.com/document/u/0/?tgif=d") return text("person@example.com", "https://docs.google.com/document/u/0/?tgif=d");
      if (url.includes("gmail.googleapis.com/gmail/v1/users/me/profile")) return json({ emailAddress: "person@example.com", messagesTotal: 1 });
      if (url.includes("googleapis.com/drive/v3/about")) return json({ user: { displayName: "Person", emailAddress: "person@example.com", permissionId: "p1" } });
      throw new Error(url);
    } }),
    filesystem: Object.freeze({
      exists: async (path) => path in files,
      readText: async (path) => files[path],
      writeText: async (path, contents) => { files[path] = contents; writes.push([path, contents]); },
      delete: async (path) => { delete files[path]; writes.push([path, null]); },
    }),
    process: Object.freeze({ execute: async () => ({ stdout: "", stderr: "" }) }),
    clock: Object.freeze({ now: () => new Date("2026-06-11T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) }),
    openFiles: Object.freeze({ open: async () => {} }),
    configuration: Object.freeze({ get: (name) => ({ GOOGLE_CREDENTIALS_FILE: "/credentials.json", GOOGLE_TOKEN_FILE: "/gmail.json", WIRE_REPOSITORY_ROOT: "/repo" })[name] }),
    secrets: Object.freeze({ get: async () => "asana-token" }),
    cookies: Object.freeze({
      load: async (service) => service === "asana" ? asanaCookies : service === "notion" ? notionCookies : service === "slack" ? slackCookies : service === "chatgpt" ? chatgptCookies : service === "gmail" || service === "google-docs" ? googleCookies : zoomCookies,
      loadSaved: async (service) => service === "asana" ? asanaCookies : service === "notion" ? notionCookies : service === "slack" ? slackCookies : service === "chatgpt" ? chatgptCookies : service === "gmail" || service === "google-docs" ? googleCookies : zoomCookies,
      metadata: async (service) => service === "slack" ? slackMetadata : Object.freeze({}),
      save: async (service, cookies, metadata) => {
        const path = `/repo/${service}_cookies.txt`;
        files[path] = serializeCookies(cookies, metadata);
        writes.push([path, files[path]]);
      },
      delete: async () => {},
    }),
    gmailTokens: Object.freeze({ load: async () => ({ token: "gmail-token", refresh_token: "refresh", token_uri: "uri" }), refresh: async () => ({ token: "gmail-refreshed", refresh_token: "refresh", token_uri: "uri" }) }),
  });
}

const environment = Object.freeze({ HOME: "/home", WIRE_REPOSITORY_ROOT: "/repo", WIRE_CHROME_EXECUTABLE: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });

function serializeCookies(cookies, metadata) {
  return `${["# Netscape HTTP Cookie File", ...Object.entries(metadata).map(([name, value]) => `# wire\t${name}\t${value}`), ...cookies.map((value) => `${value.httpOnly ? "#HttpOnly_" : ""}${value.domain}\t${value.includeSubdomains ? "TRUE" : "FALSE"}\t${value.path}\t${value.secure ? "TRUE" : "FALSE"}\t${value.expires}\t${value.name}\t${value.value}`)].join("\n")}\n`;
}

test("auth status verifies every supported service identity", async () => {
  const requests = [];
  let extracted = 0;
  const auth = composeAuth(runtime({}, requests, []), environment, async () => { extracted += 1; throw new Error("unused"); });
  assert.deepEqual((await auth.status("notion")).identity, { user_id: "user", space_id: "space" });
  assert.deepEqual((await auth.status("slack")).identity, { user_id: "U1", user: "person", team_id: "T1", team: "Workspace", url: "https://workspace.slack.com/" });
  assert.deepEqual((await auth.status("zoom")).identity, { account_id: "account" });
  assert.deepEqual((await auth.status("chatgpt")).identity, { account_id: "account" });
  assert.deepEqual((await auth.status("asana")).identity, { gid: "1", name: "Person", email: "person@example.com" });
  assert.deepEqual((await auth.status("gmail")).identity, { email: "person@example.com" });
  assert.deepEqual((await auth.status("google-docs")).identity, { email: "person@example.com" });
  assert.ok(requests.some((url) => url.includes("auth.test")));
  assert.equal(requests.filter((url) => url.includes("accounts.google.com/ListAccounts")).length, 1);
  assert.equal(requests.filter((url) => url === "https://docs.google.com/document/u/0/?tgif=d").length, 1);
  assert.equal(extracted, 0);
});

test("each cookie extractor waits for required cookies, verifies identity, and persists its own file", async () => {
  const files = {};
  const writes = [];
  const seen = [];
  const extractor = async (_environment, extraction) => {
    seen.push({ service: extraction.service, startUrl: extraction.startUrl, domains: extraction.domains });
    const values = extraction.service === "asana" ? asanaCookies : extraction.service === "notion" ? notionCookies : extraction.service === "slack" ? slackCookies : extraction.service === "chatgpt" ? chatgptCookies : extraction.service === "gmail" || extraction.service === "google-docs" ? googleCookies : zoomCookies;
    assert.equal(extraction.ready(values), true);
    assert.equal(extraction.ready(Object.freeze([])), false);
    const metadata = extraction.service === "slack" ? slackMetadata : extraction.service === "chatgpt" ? Object.freeze({ account_id: "account" }) : Object.freeze({});
    await extraction.verify(values, metadata);
    return Object.freeze({ cookies: values, metadata });
  };
  const auth = composeAuth(runtime(files, [], writes), environment, extractor);
  await auth.extractAsana();
  await auth.extractNotion();
  await auth.extractSlack();
  await auth.extractZoom();
  await auth.extractChatgpt();
  await auth.extractGmail();
  await auth.extractGoogleDocs();
  assert.deepEqual(writes.map(([path]) => path), ["/repo/asana_cookies.txt", "/repo/notion_cookies.txt", "/repo/slack_cookies.txt", "/repo/zoom_cookies.txt", "/repo/chatgpt_cookies.txt", "/repo/gmail_cookies.txt", "/repo/google-docs_cookies.txt"]);
  assert.equal(parseNetscapeCookies(files["/repo/asana_cookies.txt"]).some((value) => value.name === "ticket"), true);
  assert.equal(parseNetscapeCookies(files["/repo/notion_cookies.txt"]).some((value) => value.name === "token_v2"), true);
  assert.equal(parseNetscapeCookies(files["/repo/chatgpt_cookies.txt"]).some((value) => value.name === "oai-did"), true);
  assert.deepEqual(seen.map((value) => value.service), ["asana", "notion", "slack", "zoom", "chatgpt", "gmail", "google-docs"]);
});

test("manual cookie extraction saves cookies without post verification", async () => {
  const files = {};
  const writes = [];
  const auth = composeAuth(runtime(files, [], writes), environment, async (_environment, extraction) => {
    assert.equal(extraction.service, "google-docs");
    return Object.freeze({ cookies: googleCookies, metadata: Object.freeze({}), manual: true });
  });
  assert.deepEqual(await auth.extractGoogleDocs(), { service: "google-docs", identity: { saved: true } });
  assert.deepEqual(writes.map(([path]) => path), ["/repo/google-docs_cookies.txt"]);
  assert.equal(parseNetscapeCookies(files["/repo/google-docs_cookies.txt"])[0].name, "SID");
});

test("pasted cookies are detected, verified, normalized, and persisted", async () => {
  const files = {};
  const writes = [];
  const auth = composeAuth(runtime(files, [], writes), environment, async () => { throw new Error("unused"); });
  const asanaResult = await auth.pasteCookies("asana", "ticket=session");
  const notionResult = await auth.pasteCookies("notion", [
    "# Netscape HTTP Cookie File",
    ".notion.so\tTRUE\t/\tTRUE\t0\ttoken_v2\ttoken",
    ".notion.so\tTRUE\t/\tTRUE\t0\tnotion_user_id\tuser",
    ".notion.so\tTRUE\t/\tTRUE\t0\tnotion_users\t%5B%22user%22%5D",
  ].join("\n"));
  const chatgptResult = await auth.pasteCookies("chatgpt", JSON.stringify({ cookies: [{ name: "oai-did", value: "device" }, { name: "__Secure-next-auth.session-token", value: "session" }] }));
  assert.deepEqual(asanaResult.identity, { gid: "1", name: "Person", email: "person@example.com" });
  assert.deepEqual(notionResult.identity, { user_id: "user", space_id: "space" });
  assert.deepEqual(chatgptResult.identity, { account_id: "account" });
  assert.deepEqual(writes.map(([path]) => path), ["/repo/asana_cookies.txt", "/repo/notion_cookies.txt", "/repo/chatgpt_cookies.txt"]);
  assert.equal(parseNetscapeCookies(files["/repo/asana_cookies.txt"]).find((value) => value.name === "ticket").domain, ".asana.com");
  assert.equal(parseNetscapeCookies(files["/repo/notion_cookies.txt"]).find((value) => value.name === "token_v2").value, "token");
  assert.equal(parseNetscapeCookies(files["/repo/chatgpt_cookies.txt"]).find((value) => value.name === "oai-did").domain, ".chatgpt.com");
});

test("saving cookie auth delegates to runtime cookie storage", async () => {
  const auth = composeAuth(runtime({}, [], []), Object.freeze({}), async () => { throw new Error("unused"); });
  await auth.pasteCookies("notion", [
    "# Netscape HTTP Cookie File",
    ".notion.so\tTRUE\t/\tTRUE\t0\ttoken_v2\ttoken",
    ".notion.so\tTRUE\t/\tTRUE\t0\tnotion_user_id\tuser",
    ".notion.so\tTRUE\t/\tTRUE\t0\tnotion_users\t%5B%22user%22%5D",
  ].join("\n"));
});

test("pasted Slack cookies preserve metadata before verification", async () => {
  const files = {};
  const writes = [];
  const auth = composeAuth(runtime(files, [], writes), environment, async () => { throw new Error("unused"); });
  const result = await auth.pasteCookies("slack", JSON.stringify({ cookies: [{ name: "d", value: "session", domain: ".slack.com", httpOnly: true }], metadata: slackMetadata }));
  assert.deepEqual(result.identity, { user_id: "U1", user: "person", team_id: "T1", team: "Workspace", url: "https://workspace.slack.com/" });
  assert.match(files["/repo/slack_cookies.txt"], /# wire\torigin\thttps:\/\/workspace\.slack\.com/);
  assert.match(files["/repo/slack_cookies.txt"], /#HttpOnly_\.slack\.com\tTRUE\t\/\tTRUE\t0\td\tsession/);
});

test("logout deletes saved cookie auth", async () => {
  const deleted = [];
  const authRuntime = runtime({}, [], []);
  const auth = composeAuth(Object.freeze({ ...authRuntime, cookies: Object.freeze({ ...authRuntime.cookies, delete: async (service) => { deleted.push(service); } }) }), environment, async () => { throw new Error("unused"); });
  assert.deepEqual(await auth.logout("asana"), { service: "asana", deleted: true });
  assert.deepEqual(deleted, ["asana"]);
});

test("cookie loading rejects missing cookies without a browser extraction hook", async () => {
  const files = {};
  const cookies = createCookiesCapability({
    exists: async (path) => path in files,
    readText: async (path) => files[path],
    writeText: async () => {},
    delete: async () => {},
  }, () => "/home");
  await assert.rejects(() => cookies.load("notion"), /notion cookie authentication is missing\. Run `wire notion login` once; other commands reuse saved cookies\./);
});

test("auth status rejects stale cookie credentials without opening login", async () => {
  const files = {};
  let extracted = 0;
  const staleRuntime = Object.freeze({ ...runtime(files, [], []), cookies: Object.freeze({ load: async () => Object.freeze([cookie("d", "stale", ".slack.com")]), loadSaved: async () => Object.freeze([cookie("d", "stale", ".slack.com")]), metadata: async () => Object.freeze({ origin: "https://workspace.slack.com", token: "xoxc-stale" }), delete: async () => {} }) });
  const auth = composeAuth(staleRuntime, environment, async (_environment, extraction) => {
    extracted += 1;
    assert.equal(extraction.service, "slack");
    await extraction.verify(slackCookies, slackMetadata);
    return Object.freeze({ cookies: slackCookies, metadata: slackMetadata });
  });
  await assert.rejects(() => auth.status("slack"), /slack cookie authentication is missing or expired\. Run `wire slack login` once; other commands reuse saved cookies\./);
  assert.equal(extracted, 0);
});

test("zoom auth status rejects malformed jwt without opening login", async () => {
  const files = {};
  let extracted = 0;
  const zoomRuntime = Object.freeze({
    ...runtime(files, [], []),
    http: Object.freeze({ request: async (input) => {
      const url = input.toString();
      if (url.includes("hub.zoom.us/nws/common")) return text("not-a-jwt");
      return runtime(files, [], []).http.request(input);
    } }),
  });
  const auth = composeAuth(zoomRuntime, environment, async (_environment, extraction) => {
    extracted += 1;
    assert.equal(extraction.service, "zoom");
    return Object.freeze({ cookies: zoomCookies, metadata: Object.freeze({}) });
  });
  await assert.rejects(() => auth.status("zoom"), /zoom cookie authentication is missing or expired\. Run `wire zoom login` once; other commands reuse saved cookies\./);
  assert.equal(extracted, 0);
});

test("zoom auth status persists cookies refreshed by verification requests", async () => {
  const files = {};
  const writes = [];
  const zoomRuntime = Object.freeze({
    ...runtime(files, [], writes),
    cookies: createCookiesCapability({
      exists: async (path) => path === "/repo/zoom_cookies.txt",
      readText: async () => [
        ".zoom.us\tTRUE\t/\tTRUE\t0\tzm_aid\taccount",
        ".zoom.us\tTRUE\t/\tTRUE\t0\t_zm_ssid\told",
      ].join("\n"),
      writeText: async (path, contents) => { writes.push([path, contents]); },
      delete: async () => {},
    }, () => "/home", () => "/repo"),
    http: Object.freeze({ request: async (input) => {
      const url = input.toString();
      if (url.includes("hub.zoom.us/nws/common")) return new Response("a.b.c", { headers: [["set-cookie", "_zm_docs_nak=jwt; Domain=.zoom.us; Path=/; Max-Age=600; Secure; HttpOnly"]] });
      throw new Error(url);
    } }),
  });
  const auth = composeAuth(zoomRuntime, environment, async () => { throw new Error("unused"); });
  assert.deepEqual((await auth.status("zoom")).identity, { account_id: "account" });
  assert.equal(writes.length, 1);
  const saved = parseNetscapeCookies(writes[0][1]);
  assert.equal(saved.find((value) => value.name === "_zm_docs_nak").value, "jwt");
});

test("chatgpt auth status rejects refresh-token errors without opening login", async () => {
  const sessions = [
    { error: "RefreshAccessTokenError", account: { id: "account" }, accessToken: "expired" },
    { account: { id: "account" }, accessToken: "fresh" },
    { account: { id: "account" }, accessToken: "fresh" },
  ];
  const files = {};
  let extracted = 0;
  const chatgptRuntime = Object.freeze({
    ...runtime(files, [], []),
    http: Object.freeze({ request: async (input) => {
      if (input.toString() === "https://chatgpt.com/api/auth/session") return json(sessions.shift());
      throw new Error(input.toString());
    } }),
  });
  const auth = composeAuth(chatgptRuntime, environment, async (_environment, extraction) => {
    extracted += 1;
    assert.equal(extraction.service, "chatgpt");
    await extraction.verify(chatgptCookies, Object.freeze({}));
    return Object.freeze({ cookies: chatgptCookies, metadata: Object.freeze({ account_id: "account" }) });
  });
  await assert.rejects(() => auth.status("chatgpt"), /chatgpt cookie authentication is missing or expired\. Run `wire chatgpt login` once; other commands reuse saved cookies\./);
  assert.equal(extracted, 0);
});

test("chatgpt auth status rejects HTML challenges without opening browser verification", async () => {
  const files = {};
  const chatgptRuntime = Object.freeze({
    ...runtime(files, [], []),
    http: Object.freeze({ request: async (input) => {
      if (input.toString() === "https://chatgpt.com/api/auth/session") return text("<!doctype html>");
      throw new Error(input.toString());
    } }),
  });
  const auth = composeAuth(chatgptRuntime, environment, async () => { throw new Error("unused"); });
  await assert.rejects(() => auth.status("chatgpt"), /chatgpt cookie authentication is missing or expired\. Run `wire chatgpt login` once; other commands reuse saved cookies\./);
});
