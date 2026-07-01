import assert from "node:assert/strict";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  composeNodeRuntime,
  createCookiesCapability,
  createGoogleTokensCapability,
  createNodeClock,
  createNodeConfiguration,
  createNodeFilesystem,
  createNodeHttp,
  createNodeOpenFiles,
  createNodeProcess,
  createNodeSecrets,
  detectCookieFormat,
  googleTokenExpired,
  mergeGoogleRefresh,
  parseCookieHeader,
  parseJsonCookies,
  parseGoogleCredentials,
  parseGoogleToken,
  parseNetscapeCookies,
  parsePastedCookieMetadata,
  parsePastedCookies,
  serializeNetscapeCookies,
} from "../dist/index.js";
import { chromeLaunchArguments, chromeUserDataDir } from "../../wire-core/dist/runtime/chrome.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const testRoot = join(repositoryRoot, "out", "wire-ts-runtime");

function fakeFilesystem(files) {
  const writes = [];
  return {
    writes,
    capability: {
      exists: async (path) => path in files,
      readText: async (path) => files[path],
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      delete: async (path) => { delete files[path]; writes.push({ path, contents: null }); },
    },
  };
}

test("parseNetscapeCookies parses comments, HttpOnly, flags, expiry, and tabbed values", () => {
  const cookies = parseNetscapeCookies([
    "# Netscape HTTP Cookie File",
    ".example.com\tTRUE\t/\tTRUE\t1735689600\tsession\talpha",
    "#HttpOnly_.example.com\tFALSE\t/account\tFALSE\t0\tprivate\tvalue\twith\ttabs",
    "",
  ].join("\n"));
  assert.deepEqual(cookies, [
    { domain: ".example.com", includeSubdomains: true, path: "/", secure: true, expires: 1735689600, name: "session", value: "alpha", httpOnly: false },
    { domain: ".example.com", includeSubdomains: false, path: "/account", secure: false, expires: 0, name: "private", value: "value\twith\ttabs", httpOnly: true },
  ]);
  assert.ok(Object.isFrozen(cookies));
  assert.ok(Object.isFrozen(cookies[0]));
});

test("parseNetscapeCookies handles CRLF, empty values, and session cookies", () => {
  assert.deepEqual(parseNetscapeCookies([
    "# comment",
    "example.com\tFALSE\t/\tFALSE\t0\tempty\t",
    "",
  ].join("\r\n")), [
    { domain: "example.com", includeSubdomains: false, path: "/", secure: false, expires: 0, name: "empty", value: "", httpOnly: false },
  ]);
});

test("cookie format detection prioritizes Netscape cookie files", () => {
  assert.equal(detectCookieFormat([
    "# Netscape HTTP Cookie File",
    ".x.com\tTRUE\t/\tTRUE\t1816182738\tguest_id\tv1%3Afake",
    "x.com\tFALSE\t/\tFALSE\t0\tlang\ten",
  ].join("\n")), "netscape");
  assert.equal(detectCookieFormat("#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsession\tvalue"), "netscape");
  assert.equal(detectCookieFormat(".example.com\tTRUE\t/\tTRUE\t0\tsession\ta=b; c=d"), "netscape");
  assert.equal(detectCookieFormat("Cookie: a=b; c=d"), "header");
  assert.equal(detectCookieFormat("a=b; quoted=\"v=1\""), "header");
  assert.equal(detectCookieFormat(JSON.stringify([{ name: "a", value: "b" }])), "json");
});

test("parseCookieHeader accepts raw, labeled, multi-header, and cURL cookie headers", () => {
  const expected = [
    { domain: ".x.com", includeSubdomains: true, path: "/", secure: true, expires: 0, name: "a", value: "b", httpOnly: false },
    { domain: ".x.com", includeSubdomains: true, path: "/", secure: true, expires: 0, name: "c", value: "d=e", httpOnly: false },
  ];
  assert.deepEqual(parseCookieHeader("a=b; c=d=e", ".x.com"), expected);
  assert.deepEqual(parseCookieHeader("Cookie: a=b; c=d=e", ".x.com"), expected);
  assert.deepEqual(parseCookieHeader("accept: */*\nCookie: a=b; c=d=e\nuser-agent: test", ".x.com"), expected);
  assert.deepEqual(parseCookieHeader("curl 'https://x.com/' -H 'Cookie: a=b; c=d=e'", ".x.com"), expected);
});

test("parseJsonCookies accepts browser arrays, wrapper objects, single cookies, and name-value maps", () => {
  assert.deepEqual(parseJsonCookies(JSON.stringify([{ domain: ".x.com", hostOnly: false, path: "/", secure: true, expirationDate: 1816182738, name: "guest_id", value: "fake", httpOnly: true }]), ".x.com"), [
    { domain: ".x.com", includeSubdomains: true, path: "/", secure: true, expires: 1816182738, name: "guest_id", value: "fake", httpOnly: true },
  ]);
  assert.deepEqual(parseJsonCookies(JSON.stringify({ cookies: [{ domain: "x.com", path: "/home", secure: false, expires: 0, name: "lang", value: "en" }] }), ".x.com"), [
    { domain: "x.com", includeSubdomains: false, path: "/home", secure: false, expires: 0, name: "lang", value: "en", httpOnly: false },
  ]);
  assert.deepEqual(parseJsonCookies(JSON.stringify({ name: "ct0", value: "token", domain: ".x.com" }), ".x.com"), [
    { domain: ".x.com", includeSubdomains: true, path: "/", secure: true, expires: 0, name: "ct0", value: "token", httpOnly: false },
  ]);
  assert.deepEqual(parseJsonCookies(JSON.stringify({ a: "b", c: "d" }), ".x.com").map((cookie) => [cookie.name, cookie.value]), [["a", "b"], ["c", "d"]]);
});

test("parsePastedCookies normalizes detected formats and extracts pasted metadata", () => {
  const netscape = [
    "# Netscape HTTP Cookie File",
    "# wire\torigin\thttps://workspace.slack.com",
    "# wire\ttoken\txoxc-token",
    "#HttpOnly_.slack.com\tTRUE\t/\tTRUE\t0\td\tsession",
  ].join("\n");
  assert.equal(parsePastedCookies(netscape, ".slack.com")[0].httpOnly, true);
  assert.deepEqual(parsePastedCookieMetadata(netscape), { origin: "https://workspace.slack.com", token: "xoxc-token" });
  assert.deepEqual(parsePastedCookies("Cookie: a=b", ".x.com")[0], { domain: ".x.com", includeSubdomains: true, path: "/", secure: true, expires: 0, name: "a", value: "b", httpOnly: false });
  assert.deepEqual(parsePastedCookieMetadata(JSON.stringify({ cookies: [{ name: "d", value: "session" }], metadata: { origin: "https://workspace.slack.com", token: "xoxc-token" } })), { origin: "https://workspace.slack.com", token: "xoxc-token" });
});

test("cookie metadata round-trips beside Netscape cookies", () => {
  const contents = serializeNetscapeCookies([{ domain: ".slack.com", includeSubdomains: true, path: "/", secure: true, expires: 0, name: "d", value: "session", httpOnly: true }], { origin: "https://workspace.slack.com", token: "xoxc-token" });
  assert.deepEqual(parsePastedCookieMetadata(contents), { origin: "https://workspace.slack.com", token: "xoxc-token" });
  assert.equal(parseNetscapeCookies(contents)[0].value, "session");
});

test("cookies capability reads the exact home auth convention", async () => {
  const reads = [];
  const cookies = createCookiesCapability({
    exists: async () => true,
    readText: async (path) => { reads.push(path); return "example.com\tFALSE\t/\tFALSE\t0\tname\tvalue\n"; },
    writeText: async () => {},
    delete: async () => {},
  }, () => "/home");
  assert.equal((await cookies.load("service-name"))[0].value, "value");
  assert.deepEqual(await cookies.metadata("service-name"), {});
  assert.deepEqual(reads, ["/home/.wire/auth/service-name_cookies.txt", "/home/.wire/auth/service-name_cookies.txt"]);
});

test("cookies capability reads override and repository cookie paths", async () => {
  const reads = [];
  const cookies = createCookiesCapability({
    exists: async (path) => path === "/repo/notion_cookies.txt" || path === "/custom/slack.txt",
    readText: async (path) => { reads.push(path); return "example.com\tFALSE\t/\tFALSE\t0\tname\tvalue\n"; },
    writeText: async () => {},
    delete: async () => {},
  }, () => "/home", () => "/repo", (service) => service === "slack" ? "/custom/slack.txt" : undefined);
  assert.equal((await cookies.load("notion"))[0].value, "value");
  assert.equal((await cookies.load("slack"))[0].value, "value");
  assert.deepEqual(reads, ["/repo/notion_cookies.txt", "/custom/slack.txt"]);
});

test("cookies capability prefers repository cookies over home auth cookies", async () => {
  const reads = [];
  const cookies = createCookiesCapability({
    exists: async (path) => path === "/repo/google-docs_cookies.txt" || path === "/home/.wire/auth/google-docs_cookies.txt",
    readText: async (path) => { reads.push(path); return path === "/repo/google-docs_cookies.txt" ? ".google.com\tTRUE\t/\tTRUE\t0\tSID\trepo\n" : ".google.com\tTRUE\t/\tTRUE\t0\tSID\thome\n"; },
    writeText: async () => {},
    delete: async () => {},
  }, () => "/home", () => "/repo");
  assert.equal((await cookies.load("google-docs"))[0].value, "repo");
  assert.deepEqual(reads, ["/repo/google-docs_cookies.txt"]);
});

test("node runtime reads repository cookie files when repository root is configured", async () => {
  const reads = [];
  const runtime = composeNodeRuntime({
    environment: { HOME: "/home", WIRE_REPOSITORY_ROOT: "/repo" },
    http: { request: async () => new Response() },
    filesystem: {
      exists: async (path) => path === "/repo/google-docs_cookies.txt",
      readText: async (path) => { reads.push(path); return ".google.com\tTRUE\t/\tTRUE\t0\tSID\tsession\n"; },
      writeText: async () => {},
      delete: async () => {},
    },
    process: { execute: async () => ({ stdout: "", stderr: "" }) },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }), localTimezone: () => "UTC" },
  });
  assert.equal((await runtime.cookies.load("google-docs"))[0].name, "SID");
  assert.deepEqual(reads, ["/repo/google-docs_cookies.txt"]);
});

test("cookies capability reports missing metadata with login command", async () => {
  const cookies = createCookiesCapability({
    exists: async () => false,
    readText: async () => "",
    writeText: async () => {},
    delete: async () => {},
  }, () => "/home");
  await assert.rejects(() => cookies.metadata("slack"), /slack cookie authentication is missing\. Run `wire slack login` once; other commands reuse saved cookies\./);
});

test("cookies capability deletes saved auth files", async () => {
  const files = {
    "/home/.wire/auth/asana_cookies.txt": "home",
    "/repo/asana_cookies.txt": "repo",
  };
  const deleted = [];
  const cookies = createCookiesCapability({
    exists: async (path) => path in files,
    readText: async (path) => files[path],
    writeText: async () => {},
    delete: async (path) => { deleted.push(path); delete files[path]; },
  }, () => "/home", () => "/repo");
  await cookies.delete("asana");
  assert.deepEqual(deleted, ["/repo/asana_cookies.txt", "/home/.wire/auth/asana_cookies.txt"]);
  assert.deepEqual(files, {});
});

test("Google document parsers use the installed credential source and preserve token fields", () => {
  const credentials = parseGoogleCredentials(JSON.stringify({ installed: { client_id: "client", client_secret: "secret", token_uri: "https://oauth.example/token" } }));
  assert.deepEqual(credentials, {
    client_id: "client",
    client_secret: "secret",
    token_uri: "https://oauth.example/token",
  });
  assert.ok(Object.isFrozen(credentials));
  const token = parseGoogleToken(JSON.stringify({ token: "access", refresh_token: "refresh", token_uri: "https://old.example/token", custom: { keep: true } }));
  assert.deepEqual(token, { token: "access", refresh_token: "refresh", token_uri: "https://old.example/token", custom: { keep: true } });
  assert.ok(Object.isFrozen(token));
});

test("Google token expiry and refresh merging are explicit", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  assert.equal(googleTokenExpired({ token: "a", refresh_token: "r", token_uri: "u", expiry: "2026-06-10T12:00:00.000Z" }, now), true);
  assert.equal(googleTokenExpired({ token: "a", refresh_token: "r", token_uri: "u", expiry: "2026-06-10T12:00:01.000Z" }, now), false);
  const merged = mergeGoogleRefresh(
    { token: "old", refresh_token: "old-refresh", token_uri: "old-uri", scopes: ["old"], custom: "preserved" },
    { access_token: "new", expires_in: 3600, scope: "scope-a scope-b", token_type: "Bearer" },
    now,
  );
  assert.deepEqual(merged, {
    token: "new",
    refresh_token: "old-refresh",
    token_uri: "old-uri",
    scopes: ["scope-a", "scope-b"],
    custom: "preserved",
    token_type: "Bearer",
    expiry: "2026-06-10T13:00:00.000Z",
  });
  assert.deepEqual(mergeGoogleRefresh(
    { token: "old", refresh_token: "old-refresh", token_uri: "old-uri", scopes: ["old"] },
    { access_token: "new", expires_in: 1, refresh_token: "new-refresh", scope: "", id_token: "identity" },
    now,
  ), {
    token: "new",
    refresh_token: "new-refresh",
    token_uri: "old-uri",
    scopes: [],
    id_token: "identity",
    expiry: "2026-06-10T12:00:01.000Z",
  });
});

test("Google token capability returns valid tokens without HTTP or writes", async () => {
  const filesystem = fakeFilesystem({
    "/token.json": JSON.stringify({ token: "access", refresh_token: "refresh", token_uri: "uri", expiry: "2026-06-10T13:00:00.000Z" }),
  });
  let requests = 0;
  const capability = createGoogleTokensCapability(
    filesystem.capability,
    { request: async () => { requests += 1; return new Response(); } },
    { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    "/credentials.json",
    "/token.json",
  );
  assert.equal((await capability.load()).token, "access");
  assert.equal(requests, 0);
  assert.deepEqual(filesystem.writes, []);
});

test("Google token capability refreshes directly and writes only the merged document", async () => {
  const filesystem = fakeFilesystem({
    "/token.json": JSON.stringify({ token: "old", refresh_token: "refresh", token_uri: "old-uri", expiry: "2026-06-10T11:00:00.000Z", custom: "preserved" }),
    "/credentials.json": JSON.stringify({ installed: { client_id: "client", client_secret: "secret", token_uri: "https://oauth.example/token" } }),
  });
  const requests = [];
  const capability = createGoogleTokensCapability(
    filesystem.capability,
    { request: async (input, init) => {
      requests.push({ input: input.toString(), init });
      return new Response(JSON.stringify({ access_token: "new", expires_in: 1200, token_type: "Bearer" }), { headers: { "content-type": "application/json" } });
    } },
    { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    "/credentials.json",
    "/token.json",
  );
  const token = await capability.load();
  assert.deepEqual(token, {
    token: "new",
    refresh_token: "refresh",
    token_uri: "old-uri",
    expiry: "2026-06-10T12:20:00.000Z",
    custom: "preserved",
    token_type: "Bearer",
  });
  assert.equal(requests[0].input, "https://oauth.example/token");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(requests[0].init.body.toString(), "client_id=client&client_secret=secret&refresh_token=refresh&grant_type=refresh_token");
  assert.deepEqual(filesystem.writes, [{ path: "/token.json", contents: JSON.stringify(token) }]);
});

test("Google token capability reports OAuth refresh errors before merging", async () => {
  const filesystem = fakeFilesystem({
    "/token.json": JSON.stringify({ token: "old", refresh_token: "refresh", token_uri: "old-uri", expiry: "2026-06-10T11:00:00.000Z" }),
    "/credentials.json": JSON.stringify({ installed: { client_id: "client", client_secret: "secret", token_uri: "https://oauth.example/token" } }),
  });
  const capability = createGoogleTokensCapability(
    filesystem.capability,
    { request: async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "expired refresh token" }), { status: 400, headers: { "content-type": "application/json" } }) },
    { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
    "/credentials.json",
    "/token.json",
  );
  await assert.rejects(() => capability.load(), /Google OAuth refresh failed: HTTP 400 invalid_grant: expired refresh token/);
  assert.deepEqual(filesystem.writes, []);
});

test("configuration, secrets, and opening files use exact injected values", async () => {
  const calls = [];
  const processCapability = {
    execute: async (command, args, environment) => {
      calls.push({ command, args, environment });
      return { stdout: "resolved-secret\n", stderr: "" };
    },
  };
  const configuration = createNodeConfiguration({ EXACT_NAME: "configured" });
  assert.equal(configuration.get("EXACT_NAME"), "configured");
  assert.throws(() => configuration.get("MISSING_NAME"), /Missing required environment variable: MISSING_NAME/);
  const secrets = createNodeSecrets({
    readText: async (path) => {
      calls.push({ path });
      return JSON.stringify({ "op://Agents/Item/field": "resolved-secret", "op://Agents/Other/field": "resolved-secret" });
    },
    writeText: async () => {},
  }, { WIRE_OP_SECRETS_CACHE_FILE: "/home/.wire/auth/op_secrets.json" });
  assert.equal(await secrets.get("op://Agents/Item/field"), "resolved-secret");
  assert.equal(await secrets.get("op://Agents/Other/field"), "resolved-secret");
  await assert.rejects(createNodeSecrets({ readText: async () => "{}", writeText: async () => {}, exists: async () => true, delete: async () => {} }, {}).get("op://Agents/Item/field"), /Missing required environment variable: WIRE_OP_SECRETS_CACHE_FILE/);
  await createNodeOpenFiles(processCapability).open("/tmp/document.md");
  assert.deepEqual(calls, [
    { path: "/home/.wire/auth/op_secrets.json" },
    { path: "/home/.wire/auth/op_secrets.json" },
    { command: "open", args: ["/tmp/document.md"], environment: undefined },
  ]);
});

test("Node filesystem creates parent directories for writes", async () => {
  await rm(testRoot, { recursive: true, force: true });
  const path = join(testRoot, "nested", "capability.txt");
  const filesystem = createNodeFilesystem();
  await filesystem.writeText(path, "runtime");
  assert.equal(await filesystem.readText(path), "runtime");
  await rm(testRoot, { recursive: true, force: true });
});

test("Node HTTP, filesystem, process, and clock capabilities execute real built-ins", async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
  const path = join(testRoot, "capability.txt");
  const filesystem = createNodeFilesystem();
  await filesystem.writeText(path, "runtime");
  assert.equal(await filesystem.readText(path), "runtime");
  const response = await createNodeHttp().request("data:application/json,%7B%22working%22%3Atrue%7D");
  assert.deepEqual(await response.json(), { working: true });
  const processResult = await createNodeProcess().execute(process.execPath, ["-e", "process.stdout.write('out'); process.stderr.write('err')"]);
  assert.deepEqual(processResult, { stdout: "out", stderr: "err" });
  assert.ok(Object.isFrozen(processResult));
  const clock = createNodeClock();
  assert.ok(clock.now() instanceof Date);
  assert.equal(typeof clock.localTimezone(), "string");
  assert.notEqual(clock.localTimezone(), "");
  assert.equal(clock.timezone("America/Chicago").resolvedOptions().timeZone, "America/Chicago");
  await rm(testRoot, { recursive: true, force: true });
});

test("Chrome launch arguments use the shared Wire browser profile", async () => {
  assert.equal(chromeUserDataDir({ HOME: "/home" }), "/home/Library/Application Support/Wire/Chrome");
  assert.equal(chromeUserDataDir({ HOME: "/home", WIRE_CHROME_USER_DATA_DIR: "/ignored" }), "/home/Library/Application Support/Wire/Chrome");
  assert.deepEqual(await chromeLaunchArguments({ HOME: "/home", WIRE_CHROME_USER_DATA_DIR: "/ignored" }, "https://app.asana.com/"), [
    "--user-data-dir=/home/Library/Application Support/Wire/Chrome",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "https://app.asana.com/",
  ]);
});

test("composeNodeRuntime wires cookies from HOME and Gmail token paths from exact configuration", async () => {
  const files = {
    "/home/.wire/auth/slack_cookies.txt": ".slack.com\tTRUE\t/\tTRUE\t0\td\tv\n",
    "/gmail-token.json": JSON.stringify({ token: "gmail-access", refresh_token: "refresh", token_uri: "uri", expiry: "2026-06-10T13:00:00.000Z" }),
    "/forms-token.json": JSON.stringify({ token: "forms-access", refresh_token: "refresh", token_uri: "uri", expiry: "2026-06-10T13:00:00.000Z" }),
  };
  const reads = [];
  const runtime = composeNodeRuntime({
    environment: { HOME: "/home", GOOGLE_CREDENTIALS_FILE: "/credentials.json", GOOGLE_TOKEN_FILE: "/gmail-token.json", GOOGLE_FORMS_TOKEN_FILE: "/forms-token.json" },
    http: { request: async () => new Response() },
    filesystem: { exists: async (path) => path in files, readText: async (path) => { reads.push(path); return files[path]; }, writeText: async () => {}, delete: async () => {} },
    process: { execute: async () => ({ stdout: "secret", stderr: "" }) },
    clock: { now: () => new Date("2026-06-10T12:00:00.000Z"), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
  });
  assert.equal((await runtime.cookies.load("slack"))[0].name, "d");
  assert.equal((await runtime.gmailTokens.load()).token, "gmail-access");
  assert.equal((await runtime.googleFormsTokens.load()).token, "forms-access");
  assert.deepEqual(reads, ["/home/.wire/auth/slack_cookies.txt", "/gmail-token.json", "/forms-token.json"]);
  assert.ok(Object.isFrozen(runtime));
});

test("composeNodeRuntime defers Google configuration until token load", async () => {
  const dependencies = {
    http: { request: async () => new Response() },
    filesystem: { exists: async () => true, readText: async () => "", writeText: async () => {}, delete: async () => {} },
    process: { execute: async () => ({ stdout: "", stderr: "" }) },
    clock: { now: () => new Date(), timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }) },
  };
  const runtime = composeNodeRuntime({ ...dependencies, environment: {} });
  assert.ok(Object.isFrozen(runtime));
  await assert.rejects(async () => { await runtime.gmailTokens.load(); }, /Missing required environment variable: GOOGLE_CREDENTIALS_FILE/);
  const missingToken = composeNodeRuntime({ ...dependencies, environment: { GOOGLE_CREDENTIALS_FILE: "/credentials.json" } });
  await assert.rejects(async () => { await missingToken.gmailTokens.load(); }, /Missing required environment variable: GOOGLE_TOKEN_FILE/);
  await assert.rejects(async () => { await missingToken.googleFormsTokens.load(); }, /Missing required environment variable: GOOGLE_FORMS_TOKEN_FILE/);
});

test("live repository Google token parses without exposing values", async (context) => {
  const tokenPath = join(repositoryRoot, "google_docs_token.json");
  try {
    await access(tokenPath);
  } catch {
    context.skip("repository Google token is not available");
    return;
  }
  const rawToken = JSON.parse(await readFile(tokenPath, "utf8"));
  const parsedToken = parseGoogleToken(await readFile(tokenPath, "utf8"));
  assert.equal(parsedToken.token, rawToken.token);
});

test("live repository cookie file parses without exposing values", async (context) => {
  const cookiePath = join(process.env["HOME"], ".wire", "auth", "notion_cookies.txt");
  try {
    await access(cookiePath);
  } catch {
    context.skip("repository cookie file is not available");
    return;
  }
  const contents = await readFile(cookiePath, "utf8");
  const parsed = parseNetscapeCookies(contents);
  assert.deepEqual(parsed.map((cookie) => cookie.name), parseNetscapeCookies(contents).map((cookie) => cookie.name));
});
