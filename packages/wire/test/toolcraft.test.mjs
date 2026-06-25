import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { createRoot, wirePresentation } from "../dist/adapters/root.js";
import { createExecutableRoot } from "../dist/executable.js";
import { initializeWire, openWireRegistry } from "../dist/index.js";
import { createWireMcpServer } from "../dist/mcp.js";
import { runWireCli } from "../dist/cli.js";
import { createFakeWire, downloadedResult, resource, result, detachedResult } from "./support/fake-wire.mjs";

const execFileAsync = promisify(execFile);
const fixture = resolve(import.meta.dirname, "support/cli-fixture.mjs");
const testRoot = resolve(import.meta.dirname, "../../../out/wire-ts-toolcraft");
const authResult = { service: "notion", identity: { user_id: "user", space_id: "space" } };
const resultJson = { resource_id: "notion:page-1", title: "Document", action: "attached", added: 1, modified: 0, removed: 0, remote: "https://www.notion.so/page-1", local: "Document.md", path: "/workspace/Document.md" };
const downloadedResultJson = { ...resultJson, action: "downloaded" };
const detachedResultJson = { ...resultJson, action: "detached" };
const resourceJson = { resource_id: "notion:page-1", title: "Document", type: "document", remote: "https://www.notion.so/page-1", local: "Document.md", path: "Document.md", synced_at: "2026-06-10T12:00:00.000Z" };
const switchedBackendJson = { root: "/workspace/.wire", from: "sqlite", to: "files", fromPath: "/workspace/.wire/registry.sqlite3", toPath: "/workspace/.wire/records", resources: 1 };
const colorEnv = () => {
  const env = { ...process.env, FORCE_COLOR: "1", TERM: "xterm-256color" };
  delete env.NO_COLOR;
  return env;
};
const auth = Object.freeze({
  status: async (service) => ({ service, identity: { service } }),
  pasteCookies: async (service, contents) => ({ service, identity: { contents } }),
  logout: async (service) => ({ service, deleted: true }),
  extractAsana: async () => ({ service: "asana", identity: { gid: "1" } }),
  extractChatgpt: async () => ({ service: "chatgpt", identity: { account_id: "A1" } }),
  extractGmail: async () => ({ service: "gmail", identity: { email: "person@example.com" } }),
  extractGoogleDocs: async () => ({ service: "google-docs", identity: { email: "person@example.com" } }),
  extractNotion: async () => authResult,
  extractSlack: async () => ({ service: "slack", identity: { user_id: "U1" } }),
  extractZoom: async () => ({ service: "zoom", identity: { account_id: "A1" } }),
});
const root = createRoot(createFakeWire(), "/workspace", auth);
const commands = new Map(root.children.map((command) => [command.name, command]));
const serviceCommand = (service, command) => new Map(commands.get(service).children.map((child) => [child.name, child])).get(command);
const context = (params) => ({ params });

function usageHelp(usage) {
  return new RegExp(`Run \`?${usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\`? for usage\\.`);
}

function jsonError(message) {
  return { level: "error", message };
}

async function waitForText(read, pattern) {
  const deadline = Date.now() + 5000;
  while (!pattern.test(read()) && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  assert.match(read(), pattern);
}

function waitForClose(child) {
  return Promise.race([
    new Promise((resolveClose) => child.on("close", (code, signal) => resolveClose({ code, signal }))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 5000)),
  ]);
}

const cliCases = [
  ["default attach", ["https://www.notion.so/page-1"], resultJson],
  ["attach", ["attach", "https://www.notion.so/page-1"], resultJson],
  ["init", ["init"], { root: "/workspace/.wire", backend: "sqlite", path: "registry.sqlite3", created: true }],
  ["init files", ["init", "--backend", "files"], { root: "/workspace/.wire", backend: "files", path: "records", created: true }],
  ["preview", ["preview", "https://www.notion.so/page-1"], { title: "Document", markdown: "# Document\n", data: { page_id: "page-1" } }],
  ["sync", ["sync", "notion:page-1"], downloadedResultJson],
  ["download", ["download", "https://www.notion.so/page-1"], downloadedResultJson],
  ["detach", ["detach", "notion:page-1"], detachedResultJson],
  ["open", ["open", "notion:page-1"], resourceJson],
  ["sync-all", ["sync-all"], [downloadedResultJson]],
  ["switch-db", ["switch-db"], switchedBackendJson],
];

for (const [name, args, expected] of cliCases) {
  test(`CLI ${name} JSON output through native toolcraft`, async () => {
    const execution = await execFileAsync(process.execPath, [fixture, ...args, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
    assert.deepEqual(JSON.parse(execution.stdout), expected);
  });
}

test("CLI help renders the URL attach command without a blank command name", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /attach <url>\s+Track a source URL as local Markdown\. Shorthand: wire <url>\./);
  assert.match(execution.stdout, /preview <url>\s+Preview a source URL without writing files\./);
  assert.match(execution.stdout, /sync <resource>\s+Two-way sync one registered resource\./);
  assert.match(execution.stdout, /download <url>\s+Download a source URL as local Markdown without tracking it\./);
  assert.match(execution.stdout, /detach <resource>\s+Download one registered resource and stop tracking it\./);
  assert.match(execution.stdout, /watch <file>\s+Continuously sync a registered Markdown file\./);
  assert.match(execution.stdout, /sync-all\s+Sync this directory tree; continue after failures\./);
  assert.match(execution.stdout, /open <resource>\s+Open a registered resource URL and show details\./);
  assert.doesNotMatch(execution.stdout, /^\s+show <resource>/m);
  assert.doesNotMatch(execution.stdout, /^\s+list\s+/m);
  assert.doesNotMatch(execution.stdout, /` <url>`/);
  assert.doesNotMatch(execution.stdout, /^   <url>/m);
  assert.doesNotMatch(execution.stdout, /return every updated resource|workspace watch config|resolved resource metadata/);
});

test("CLI with no arguments renders root help", async () => {
  const execution = await execFileAsync(process.execPath, [fixture], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /^wire (?:-|—) Sync web resources with local Markdown\./m);
  assert.match(execution.stdout, /Usage: wire \[command\] \[OPTIONS\]/);
  assert.doesNotMatch(execution.stdout, /^## /m);
  assert.doesNotMatch(execution.stdout, /Usage: `/);
  assert.doesNotMatch(execution.stdout, /missing required argument 'url'/);
});

test("CLI help command renders root and command help", async () => {
  const root = await execFileAsync(process.execPath, [fixture, "help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(root.stdout, /^wire (?:-|—) Sync web resources with local Markdown\./m);
  assert.match(root.stdout, /Usage: wire \[command\] \[OPTIONS\]/);
  assert.doesNotMatch(root.stdout, /Expected source URL or command|Unknown command|Use --debug/);
  assert.equal(root.stderr, "");
  const version = await execFileAsync(process.execPath, [fixture, "help", "version"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(version.stdout, /^wire (?:-|—) Sync web resources with local Markdown\./m);
  assert.match(version.stdout, /Usage: wire \[command\] \[OPTIONS\]/);
  assert.doesNotMatch(version.stdout, /Expected source URL or command|Unknown command|Use --debug/);
  assert.equal(version.stderr, "");
  for (const args of [["help", "sync"], ["sync", "help"]]) {
    const sync = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(sync.stdout, /^sync (?:-|—) Two-way sync one registered resource\./m);
    assert.match(sync.stdout, /Usage: wire sync \[OPTIONS\] <resource>/);
    assert.doesNotMatch(sync.stdout, /Expected source URL or command|Unknown command|Resource not found|Use --debug/);
    assert.equal(sync.stderr, "");
  }
  for (const args of [["help", "https://www.notion.so/page-1"], ["https://www.notion.so/page-1", "help"], ["https://www.notion.so/page-1", "--help"]]) {
    const attach = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(attach.stdout, /^attach (?:-|—) Track a source URL as local Markdown\./m);
    assert.match(attach.stdout, /Shorthand: wire <url>\./m);
    assert.match(attach.stdout, /Usage: wire attach \[OPTIONS\] <url>/);
    assert.doesNotMatch(attach.stdout, /^wire (?:-|—) Sync web resources with local Markdown\./m);
    assert.doesNotMatch(attach.stdout, /Expected source URL or command|Unknown command|Use --debug/);
    assert.equal(attach.stderr, "");
  }
  const service = await execFileAsync(process.execPath, [fixture, "google-docs", "help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(service.stdout, /^google-docs (?:-|—) Manage Google Docs\/Sheets login\./m);
  assert.match(service.stdout, /Usage: wire google-docs \[command\] \[OPTIONS\]/);
  assert.doesNotMatch(service.stdout, /Chrome|Use --paste/);
  assert.doesNotMatch(service.stdout, /Expected source URL or command|Unknown command|Use --debug/);
  assert.equal(service.stderr, "");
  for (const args of [["help", "google-docs", "login"], ["google-docs", "help", "login"], ["google-docs", "login", "help"]]) {
    const login = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(login.stdout, /^google-docs login (?:-|—) Capture cookies once; normal commands reuse saved cookies\./m);
    assert.match(login.stdout, /Usage: wire google-docs login \[OPTIONS\]/);
    assert.doesNotMatch(login.stdout, /Chrome|Use --paste|Expected source URL or command|Unknown command|Use --debug/);
    assert.equal(login.stderr, "");
  }
});

test("CLI command help ignores valid debug modes before command paths", async () => {
  for (const args of [["--debug=raw", "help", "sync"], ["--debug", "raw", "sync", "--help"], ["sync", "--debug=raw", "help"]]) {
    const sync = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(sync.stdout, /(?:^sync (?:-|—) Two-way sync one registered resource\.|sync <resource>\s+Two-way sync one registered resource\.)/m);
    assert.match(sync.stdout, /(?:Usage: wire sync \[OPTIONS\] <resource>|Usage: wire \[command\] \[OPTIONS\])/);
    assert.doesNotMatch(sync.stdout, /Expected source URL or command|Unknown command|Use --debug/);
    assert.equal(sync.stderr, "");
  }
  for (const args of [["--debug=raw", "google-docs", "help", "login"], ["--debug", "raw", "help", "google-docs", "login"], ["google-docs", "login", "--debug=raw", "help"]]) {
    const login = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(login.stdout, /(?:^google-docs login (?:-|—) Capture cookies once; normal commands reuse saved cookies\.|google-docs\s+Manage Google Docs\/Sheets login\.)/m);
    assert.match(login.stdout, /(?:Usage: wire google-docs login \[OPTIONS\]|Usage: wire \[command\] \[OPTIONS\])/);
    assert.doesNotMatch(login.stdout, /Expected source URL or command|Unknown command|Use --debug/);
    assert.equal(login.stderr, "");
  }
});

test("CLI with only global options renders root help", async () => {
  for (const args of [["--debug", "raw"]]) {
    const execution = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(execution.stdout, /^wire (?:-|—) Sync web resources with local Markdown\./m);
    assert.match(execution.stdout, /Usage: wire \[command\] \[OPTIONS\]/);
    assert.doesNotMatch(execution.stdout, /^## /m);
    assert.doesNotMatch(execution.stdout, /Usage: `/);
    assert.doesNotMatch(execution.stdout, /missing required argument 'url'/);
  }
});

test("CLI version flags render version", async () => {
  for (const flag of ["--version", "-V", "version"]) {
    for (const args of flag === "version" ? [[flag], ["--json", flag]] : [[flag], ["sync", flag]]) {
      const execution = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
      assert.equal(execution.stdout, "0.1.0\n");
      assert.doesNotMatch(execution.stdout, /Unknown option|Unknown command|Expected source URL or command/);
      assert.equal(execution.stderr, "");
    }
  }
});

test("CLI bare auth group renders service help", async () => {
  for (const [service, title] of [["google-docs", "Google Docs/Sheets"], ["slack", "Slack"]]) {
    const execution = await execFileAsync(process.execPath, [fixture, service], { env: { ...process.env, NO_COLOR: "1" } });
    assert.match(execution.stdout, new RegExp(`^${service} (?:-|—) Manage ${title} login\\.`, "m"));
    assert.match(execution.stdout, new RegExp(`Usage: wire ${service} \\[command\\] \\[OPTIONS\\]`));
    assert.doesNotMatch(execution.stdout, /^## /m);
    assert.doesNotMatch(execution.stdout, /Usage: `/);
    assert.doesNotMatch(execution.stdout, /outputHelp|Unknown command|Missing required argument|~\/\.wire\/auth|auth\.test/);
  }
});

test("CLI init help names backend choices", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "init", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /--backend <value>\s+Registry backend: sqlite or files\. \(default: sqlite\)/);
});

test("CLI preview help names preview URL input", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "preview", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /<url>\s+Supported source URL to preview\. \(required\)/);
  assert.doesNotMatch(execution.stdout, /Supported source URL to attach/);
});

test("CLI open help describes URL opening and resource details", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "open", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /^open (?:-|—) Open a registered resource URL and show details\./m);
  assert.match(execution.stdout, /<resource>\s+Registered resource URL, resource ID, or Markdown path\. \(required\)/);
});

test("CLI sync, download, and detach help distinguish tracking semantics", async () => {
  const sync = await execFileAsync(process.execPath, [fixture, "sync", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(sync.stdout, /^sync (?:-|—) Two-way sync one registered resource\./m);
  assert.match(sync.stdout, /<resource>\s+Registered resource URL, resource ID, or Markdown path\. \(required\)/);
  assert.doesNotMatch(sync.stdout, /without tracking/);
  const download = await execFileAsync(process.execPath, [fixture, "download", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(download.stdout, /^download (?:-|—) Download a source URL as local Markdown without tracking it\./m);
  assert.match(download.stdout, /<url>\s+Supported source URL to download\. \(required\)/);
  assert.doesNotMatch(download.stdout, /Two-way sync/);
  const detach = await execFileAsync(process.execPath, [fixture, "detach", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(detach.stdout, /^detach (?:-|—) Download one registered resource and stop tracking it\./m);
  assert.match(detach.stdout, /<resource>\s+Registered resource URL, resource ID, or Markdown path\. \(required\)/);
});

test("CLI sync-all help describes current directory scope", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync-all", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /^sync-all (?:-|—) Sync this directory tree; continue after failures\./m);
  assert.doesNotMatch(execution.stdout, /Sync every registered resource|under the current directory\./);
});

test("CLI watch help describes continuous sync behavior", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "watch", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /^watch (?:-|—) Continuously sync a registered Markdown file\./m);
  assert.match(execution.stdout, /<file>\s+Registered Markdown path to watch\. \(required\)/);
  assert.doesNotMatch(execution.stdout, /^watch - Watch a registered Markdown file\./m);
});

test("CLI command help includes output format control", async () => {
  for (const args of [["--help"], ["sync", "--help"], ["sync-all", "--help"], ["google-docs", "--help"], ["google-docs", "login", "--help"]]) {
    const execution = await execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    if (args[0] === "--help") assert.match(execution.stdout, /--output <format>/);
    assert.doesNotMatch(execution.stdout, /--debug/);
  }
});

test("CLI root help keeps version separate from output control", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /^Options: --output <format>\s+--version$/m);
  assert.doesNotMatch(execution.stdout, /^## /m);
  assert.doesNotMatch(execution.stdout, /Usage: `/);
});

test("CLI help in a tty does not render literal command row backticks", async (t) => {
  const originalWrite = process.stdout.write;
  const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  let output = "";
  process.stdout.write = ((chunk, encoding, callback) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    if (typeof encoding === "function") encoding();
    if (callback !== undefined) callback();
    return true;
  });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  t.after(() => {
    process.stdout.write = originalWrite;
    if (originalIsTty === undefined) delete process.stdout.isTTY;
    else Object.defineProperty(process.stdout, "isTTY", originalIsTty);
  });
  await runWireCli(createRoot(createFakeWire(), "/workspace", auth, async () => ""), ["node", "wire", "--help"], "/workspace");
  assert.match(output, /^\s+attach <url>\s+Track a source URL as/m);
  assert.doesNotMatch(output, /^\s+`attach <url>`/m);
});

test("CLI open Markdown output renders the resource", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "open", resource.id, "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "opened  Document\nremote: https://www.notion.so/page-1\nlocal:  Document.md\nid:     notion:page-1\n");
});

test("CLI rich output stays compact without framed cards", async () => {
  const syncAll = await execFileAsync(process.execPath, [fixture, "sync-all", "--output", "rich"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(syncAll.stdout, /downloaded\s+\+1 ~0 -0\s+Document/);
  assert.match(syncAll.stdout, /checked:\s+1/);
  assert.doesNotMatch(syncAll.stdout, /[╭╮╯╰─]/);
});

test("CLI rich output colors wire change counts like git", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync", resource.id, "--output", "rich"], { env: colorEnv() });
  assert.match(execution.stdout, /\x1b\[32m\+1\x1b\[/);
  assert.match(execution.stdout, /\x1b\[33m~0\x1b\[/);
  assert.match(execution.stdout, /\x1b\[31m-0\x1b\[/);
  assert.match(execution.stdout, /Document/);
});

test("CLI Markdown output keeps resource titles and paths on one display line", async () => {
  const messyResource = {
    ...resource,
    id: "notion:page-1\ncontinued",
    urls: ["https://www.notion.so/page-1\ntracking"],
    filesystem_links: [{ path: "Folder\nDocument.md", role: "primary", data: {} }],
    data: [
      { namespace: "wire", key: "title", value: "Document\nSecond\tTab" },
      { namespace: "wire", key: "synced_at", value: "2026-06-10T12:00:00.000Z" },
    ],
  };
  assert.equal(wirePresentation.open.markdown(messyResource), "opened  Document Second Tab\nremote: https://www.notion.so/page-1 tracking\nlocal:  Folder Document.md\nid:     notion:page-1 continued");
  assert.equal(wirePresentation.sync.markdown({ ...downloadedResult, resource: messyResource }), "downloaded  +1 ~0 -0  Document Second Tab\nlocal:  Folder Document.md");
  assert.equal(wirePresentation.detach.markdown({ ...detachedResult, resource: messyResource }), "detached  +1 ~0 -0  Document Second Tab\nlocal:  Folder Document.md");
});

test("CLI Markdown output keeps workspace and watch fields on one display line", async () => {
  const messyResource = {
    ...resource,
    id: "notion:page-1\ncontinued",
    urls: ["https://www.notion.so/page-1\ntracking"],
    filesystem_links: [{ path: "Folder\nDocument.md", role: "primary", data: {} }],
    data: [
      { namespace: "wire", key: "title", value: "Document\nSecond\tTab" },
      { namespace: "wire", key: "synced_at", value: "2026-06-10T12:00:00.000Z" },
    ],
  };
  const initialized = { root: "/workspace\nproject/.wire", backend: "sqlite\nregistry", path: "registry\n.sqlite3", created: true };
  const initializedAbsolute = { root: "/workspace/.wire", backend: "sqlite", path: "/workspace/.wire/registry.sqlite3", created: true };
  const switched = { root: "/workspace\nproject/.wire", from: "sqlite\nold", to: "files\nnew", fromPath: "/workspace\nproject/.wire/registry.sqlite3", toPath: "/workspace\nproject/.wire/records", resources: 1 };
  const watchSession = { resource: messyResource, path: "/workspace/Folder\nDocument.md", mode: "two-way\npoll", debounceMs: 1000, pollMs: 60000, closed: Promise.resolve(), close: () => {} };
  assert.equal(wirePresentation.init.markdown(initialized), "workspace created\nroot:    /workspace project/.wire\nbackend: sqlite registry\nregistry: registry .sqlite3\nattach:  wire <url>");
  assert.equal(wirePresentation.init.markdown(initializedAbsolute), "workspace created\nroot:    /workspace/.wire\nbackend: sqlite\nregistry: registry.sqlite3\nattach:  wire <url>");
  assert.deepEqual(wirePresentation.init.json(initialized), initialized);
  assert.deepEqual(wirePresentation.init.json(initializedAbsolute), initializedAbsolute);
  assert.equal(wirePresentation.switchBackend.markdown(switched), "registry switched\nbackend:   sqlite old -> files new\nresources: 1\nfrom:      /workspace project/.wire/registry.sqlite3\nto:        /workspace project/.wire/records");
  assert.deepEqual(wirePresentation.switchBackend.json(switched), switched);
  assert.equal(wirePresentation.watch.markdown(watchSession), "watching Document Second Tab\nlocal:  Folder Document.md\nmode:   two-way poll\ntiming: debounce 1000ms, poll 60000ms\nstop:   Ctrl-C");
  const execution = await execFileAsync(process.execPath, [fixture, "watch", resource.filesystem_links[0].path, "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_MESSY_RESOURCE: "1" } });
  assert.equal(execution.stdout, "watching Document Second Tab\nlocal:  Folder Document.md\nmode:   two-way poll\ntiming: debounce 1000ms, poll 60000ms\nstop:   Ctrl-C\n");
});

test("CLI suppresses broken pipe stacks when stdout closes early", async () => {
  const child = spawn(process.execPath, [fixture, "sync-all", "--json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_LARGE_LIST: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let stdoutStarted = false;
  let stderr = "";
  child.stdout.on("data", () => {
    stdoutStarted = true;
    child.stdout.destroy();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.equal(stdoutStarted, true);
  assert.equal(exitCode, 0, stderr);
  assert.equal(stderr, "");
});

test("CLI init Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "init", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "workspace created\nroot:    /workspace/.wire\nbackend: sqlite\nregistry: registry.sqlite3\nattach:  wire <url>\n");
});

test("CLI init files Markdown output uses the files registry path", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "init", "--backend", "files", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "workspace created\nroot:    /workspace/.wire\nbackend: files\nregistry: records\nattach:  wire <url>\n");
});

test("CLI switch-db Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "switch-db", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "registry switched\nbackend:   sqlite -> files\nresources: 1\nfrom:      /workspace/.wire/registry.sqlite3\nto:        /workspace/.wire/records\n");
});

test("init Markdown output distinguishes an existing workspace", async () => {
  const readyRoot = createRoot(Object.freeze({ ...createFakeWire(), init: async (path, backend, registryPath) => ({ root: `${path}/.wire`, backend, path: registryPath, created: false }) }), "/workspace", auth);
  const readyCommands = new Map(readyRoot.children.map((command) => [command.name, command]));
  const value = await readyCommands.get("init").handler(context({ backend: "sqlite" }));
  assert.equal(readyCommands.get("init").render.markdown(value), "workspace ready\nroot:    /workspace/.wire\nbackend: sqlite\nregistry: registry.sqlite3");
});

test("CLI bin suppresses Node experimental warnings even when reexec marker is present", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-bin-warnings");
  const project = resolve(root, "project");
  const home = resolve(root, "home");
  await rm(root, { recursive: true, force: true });
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  const execution = await execFileAsync(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "init"], { cwd: project, env: { ...process.env, HOME: home, NO_COLOR: "1", WIRE_NODE_NO_WARNINGS_REEXEC: "1" } });
  assert.match(execution.stdout, /workspace created/);
  assert.doesNotMatch(execution.stdout, /ExperimentalWarning|SQLite is an experimental feature/);
  assert.doesNotMatch(execution.stderr, /Error|TypeError|SyntaxError/);
});

test("CLI bin rebuilds with workspace TypeScript when dev-linked", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-bin-dev-attach");
  const workspace = join(root, "workspace");
  const packageRoot = join(workspace, "packages", "wire");
  const marker = join(root, "tsc-marker.txt");
  await rm(root, { recursive: true, force: true });
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await mkdir(join(workspace, "node_modules", "typescript", "bin"), { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(packageRoot, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await writeFile(join(packageRoot, "bin", "wire.mjs"), await readFile(resolve(import.meta.dirname, "../bin/wire.mjs"), "utf8"), "utf8");
  await writeFile(join(packageRoot, "dist", "executable.js"), "export function createExecutableRoot() { return {}; }\n", "utf8");
  await writeFile(join(packageRoot, "dist", "cli.js"), "export async function runWireCli() { process.stdout.write('ran\\n'); }\n", "utf8");
  await writeFile(join(workspace, "node_modules", "typescript", "bin", "tsc"), "const { writeFileSync } = require('node:fs');\nwriteFileSync(process.env.WIRE_TEST_TSC_MARKER, process.cwd());\n", "utf8");
  await symlink(join(packageRoot, "bin", "wire.mjs"), join(root, "wire"));
  const execution = await execFileAsync(process.execPath, [join(root, "wire")], { env: { ...process.env, WIRE_TEST_TSC_MARKER: marker } });
  assert.equal(execution.stdout, "ran\n");
  assert.equal(execution.stderr, "");
});

test("MCP bin rebuilds with workspace TypeScript when dev-linked", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-mcp-bin-dev-attach");
  const workspace = join(root, "workspace");
  const packageRoot = join(workspace, "packages", "wire");
  const marker = join(root, "tsc-marker.txt");
  await rm(root, { recursive: true, force: true });
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await mkdir(join(workspace, "node_modules", "typescript", "bin"), { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(packageRoot, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await writeFile(join(packageRoot, "bin", "wire-mcp.mjs"), await readFile(resolve(import.meta.dirname, "../bin/wire-mcp.mjs"), "utf8"), "utf8");
  await writeFile(join(packageRoot, "dist", "executable.js"), "export function createExecutableRoot() { return {}; }\n", "utf8");
  await writeFile(join(packageRoot, "dist", "mcp.js"), "export async function runWireMcp() { process.stdout.write('mcp ran\\n'); }\n", "utf8");
  await writeFile(join(workspace, "node_modules", "typescript", "bin", "tsc"), "const { writeFileSync } = require('node:fs');\nwriteFileSync(process.env.WIRE_TEST_TSC_MARKER, process.cwd());\n", "utf8");
  await symlink(join(packageRoot, "bin", "wire-mcp.mjs"), join(root, "wire-mcp"));
  const execution = await execFileAsync(process.execPath, [join(root, "wire-mcp")], { env: { ...process.env, WIRE_TEST_TSC_MARKER: marker } });
  assert.equal(execution.stdout, "mcp ran\n");
  assert.equal(execution.stderr, "");
});

test("CLI watch Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "watch", resource.filesystem_links[0].path, "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "watching Document\nlocal:  Document.md\nmode:   two-way\ntiming: debounce 1000ms, poll 60000ms\nstop:   Ctrl-C\n");
});

test("CLI bin watch exits when SIGINT is sent to the no-warning wrapper", async (t) => {
  const project = join(testRoot, "watch-sigint");
  const home = join(project, "home");
  await rm(project, { recursive: true, force: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(project, { recursive: true, force: true }));
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeFile(join(project, "Document.md"), "# Document\n", "utf8");
  const registry = await openWireRegistry(project, home);
  await registry.put(resource);
  const child = spawn(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "watch", "Document.md"], { cwd: project, env: { ...process.env, HOME: home, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForText(() => stdout, /watching Document/);
  child.kill("SIGINT");
  const closed = await waitForClose(child);
  if (closed === "timeout") child.kill("SIGKILL");
  assert.deepEqual(closed, { code: null, signal: "SIGINT" });
  assert.doesNotMatch(stderr, /Error|TypeError|SyntaxError/);
});

test("CLI watch JSON output hides runtime handles", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "watch", resource.filesystem_links[0].path, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), { resource_id: "notion:page-1", title: "Document", remote: "https://www.notion.so/page-1", local: "Document.md", path: "/workspace/Document.md", mode: "two-way", debounceMs: 1000, pollMs: 60000 });
});

test("watch JSON rendering closes runtime handles", async () => {
  let closed = false;
  let resolveClosed;
  const pendingRoot = createRoot(Object.freeze({ ...createFakeWire(), watch: async () => ({ resource, path: "/workspace/Document.md", mode: "two-way", debounceMs: 1000, pollMs: 60000, closed: new Promise((resolve) => { resolveClosed = resolve; }), close: () => { closed = true; resolveClosed(); } }) }), "/workspace", auth);
  const pendingCommands = new Map(pendingRoot.children.map((command) => [command.name, command]));
  const value = await pendingCommands.get("watch").handler(context({ file: "Document.md" }));
  assert.deepEqual(pendingCommands.get("watch").render.json(value), { resource_id: "notion:page-1", title: "Document", remote: "https://www.notion.so/page-1", local: "Document.md", path: "/workspace/Document.md", mode: "two-way", debounceMs: 1000, pollMs: 60000 });
  assert.equal(closed, true);
  await value.closed;
});

test("watch command returns before the watch session closes", async () => {
  const pendingRoot = createRoot(Object.freeze({ ...createFakeWire(), watch: async () => ({ resource, path: "/workspace/Document.md", mode: "two-way", debounceMs: 1000, pollMs: 60000, closed: new Promise(() => {}), close: () => {} }) }), "/workspace", auth);
  const pendingCommands = new Map(pendingRoot.children.map((command) => [command.name, command]));
  const value = await Promise.race([
    pendingCommands.get("watch").handler(context({ file: "Document.md" })).then(({ closed: _closed, close: _close, ...session }) => session),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 50)),
  ]);
  assert.deepEqual(value, { resource, path: "/workspace/Document.md", mode: "two-way", debounceMs: 1000, pollMs: 60000 });
});

test("CLI sync Markdown output renders compact local summary", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync", resource.id, "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "downloaded  +1 ~0 -0  Document\nlocal:  Document.md\n");
});

test("CLI download Markdown output renders compact local summary", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "download", resource.urls[0], "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "downloaded  +1 ~0 -0  Document\nlocal:  Document.md\n");
});

test("CLI defaults to compact rich terminal output", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync", resource.id], { env: colorEnv() });
  assert.match(execution.stdout, /downloaded/);
  assert.match(execution.stdout, /Document/);
  assert.match(execution.stdout, /local:\s+Document\.md/);
});

test("CLI NO_COLOR default output stays plain", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync", resource.id], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(execution.stdout, /downloaded\s+\+1 ~0 -0\s+Document/);
  assert.match(execution.stdout, /local:\s+Document\.md/);
});

test("sync Markdown output labels resources by title instead of generated filename", async () => {
  const longPath = "copy-of-poe-features-poe-projects-google-docs-1E40XntedtVY_q_bQVzW4WpBBh4Yz0SGbiKYUuwvdCg4-gid-175683982.md";
  const titledResource = { ...resource, filesystem_links: [{ ...resource.filesystem_links[0], path: longPath }], data: resource.data.map((item) => item.namespace === "wire" && item.key === "title" ? { ...item, value: "Copy of Poe Features - poe-projects" } : item) };
  const titledResult = { ...downloadedResult, resource: titledResource, path: longPath, summary: { ...downloadedResult.summary, local: longPath } };
  const titledRoot = createRoot(Object.freeze({ ...createFakeWire(), sync: async () => titledResult }), "/workspace", auth);
  const titledCommands = new Map(titledRoot.children.map((command) => [command.name, command]));
  const value = await titledCommands.get("sync").handler(context({ resource: titledResource.id }));
  assert.equal(titledCommands.get("sync").render.markdown(value), "downloaded  +1 ~0 -0  Copy of Poe Features - poe-projects\nlocal:  copy-of-poe-features-poe-projects-google-docs-1E40XntedtVY_q_bQVzW4WpBBh4Yz0SGbiKYUuwvdCg4-gid-175683982.md");
});

test("CLI sync-all Markdown output renders compact local summaries", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync-all", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "downloaded  +1 ~0 -0  Document\nlocal:  Document.md\n\nchecked: 1\n");
});

test("sync-all Markdown output collapses no-op resources", async () => {
  const noChange = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "synced", added: 0, modified: 0, removed: 0 } };
  const noChangeRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [noChange] }), "/workspace", auth);
  const noChangeCommands = new Map(noChangeRoot.children.map((command) => [command.name, command]));
  const value = await noChangeCommands.get("sync-all").handler(context({}));
  assert.equal(noChangeCommands.get("sync-all").render.markdown(value), "no changes\nchecked: 1");
});

test("sync-all Markdown output names empty registries", async () => {
  const emptyRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [] }), "/workspace", auth);
  const emptyCommands = new Map(emptyRoot.children.map((command) => [command.name, command]));
  const value = await emptyCommands.get("sync-all").handler(context({}));
  assert.equal(emptyCommands.get("sync-all").render.markdown(value), "no resources");
  assert.deepEqual(emptyCommands.get("sync-all").render.json(value), []);
});

test("sync-all Markdown output includes zero-diff uploads", async () => {
  const uploaded = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "uploaded", added: 0, modified: 0, removed: 0 } };
  const uploadedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [uploaded] }), "/workspace", auth);
  const uploadedCommands = new Map(uploadedRoot.children.map((command) => [command.name, command]));
  const value = await uploadedCommands.get("sync-all").handler(context({}));
  assert.equal(uploadedCommands.get("sync-all").render.markdown(value), "uploaded  Document\nlocal:  Document.md\n\nchecked: 1");
});

test("sync-all Markdown output includes failed resources", async () => {
  const failed = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "failed", added: 0, modified: 0, removed: 0, error: "Remote document disappeared" } };
  const failedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [failed] }), "/workspace", auth);
  const failedCommands = new Map(failedRoot.children.map((command) => [command.name, command]));
  const value = await failedCommands.get("sync-all").handler(context({}));
  assert.equal(failedCommands.get("sync-all").render.markdown(value), "failed  Document\nlocal:  Document.md\nerror:  Remote document disappeared\n\nchecked: 1");
});

test("sync-all Markdown output indents multiline failed resource errors", async () => {
  const failed = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "failed", added: 0, modified: 0, removed: 0, error: "Google Sheets sync cannot upload formula-like cell text at row 2, column 2\nPrefix it with an apostrophe or rewrite it as plain text before syncing." } };
  const failedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [failed] }), "/workspace", auth);
  const failedCommands = new Map(failedRoot.children.map((command) => [command.name, command]));
  const value = await failedCommands.get("sync-all").handler(context({}));
  assert.equal(failedCommands.get("sync-all").render.markdown(value), "failed  Document\nlocal:  Document.md\nerror:  Google Sheets sync cannot upload formula-like cell text at row 2, column 2\n        Prefix it with an apostrophe or rewrite it as plain text before syncing.\n\nchecked: 1");
});

test("sync-all Markdown output keeps failed resource error lines terminal safe", async () => {
  const rawError = "Google Sheets save failed:\r\nrow 2\tcolumn 2\rformula blocked";
  const failed = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "failed", added: 0, modified: 0, removed: 0, error: rawError } };
  const failedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [failed] }), "/workspace", auth);
  const failedCommands = new Map(failedRoot.children.map((command) => [command.name, command]));
  const value = await failedCommands.get("sync-all").handler(context({}));
  assert.equal(failedCommands.get("sync-all").render.markdown(value), "failed  Document\nlocal:  Document.md\nerror:  Google Sheets save failed:\n        row 2 column 2\n        formula blocked\n\nchecked: 1");
  assert.deepEqual(failedCommands.get("sync-all").render.json(value), [{ ...downloadedResultJson, action: "failed", added: 0, error: rawError }]);
  const execution = await execFileAsync(process.execPath, [fixture, "sync-all"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ALL_FAILED: "1", WIRE_FAKE_SYNC_ALL_FAILED_ERROR: rawError } });
  assert.match(execution.stdout, /failed\s+Document/);
  assert.match(execution.stdout, /local:\s+Document\.md/);
  assert.match(execution.stdout, /error:\s+Google Sheets save failed:/);
  assert.match(execution.stdout, /row 2 column 2/);
  assert.match(execution.stdout, /formula blocked/);
  assert.match(execution.stdout, /checked:\s+1/);
  assert.equal(execution.stderr, "");
});

test("CLI sync-all renders failed resources in Markdown output", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync-all"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ALL_FAILED: "1" } });
  assert.match(execution.stdout, /failed\s+Document/);
  assert.match(execution.stdout, /local:\s+Document\.md/);
  assert.match(execution.stdout, /error:\s+Remote document disappeared/);
  assert.match(execution.stdout, /checked:\s+1/);
  assert.equal(execution.stderr, "");
});

test("sync-all Markdown output counts hidden no-op resources", async () => {
  const noChange = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "synced", added: 0, modified: 0, removed: 0 } };
  const mixedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [downloadedResult, noChange] }), "/workspace", auth);
  const mixedCommands = new Map(mixedRoot.children.map((command) => [command.name, command]));
  const value = await mixedCommands.get("sync-all").handler(context({}));
  assert.equal(mixedCommands.get("sync-all").render.markdown(value), "downloaded  +1 ~0 -0  Document\nlocal:  Document.md\n\nchecked: 2");
});

test("sync-all JSON output summarizes failed resources without Markdown payloads", async () => {
  const failed = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "failed", added: 0, modified: 0, removed: 0, error: "Remote document disappeared" } };
  const failedRoot = createRoot(Object.freeze({ ...createFakeWire(), syncAll: async () => [failed] }), "/workspace", auth);
  const failedCommands = new Map(failedRoot.children.map((command) => [command.name, command]));
  const value = await failedCommands.get("sync-all").handler(context({}));
  assert.deepEqual(failedCommands.get("sync-all").render.json(value), [{ ...downloadedResultJson, action: "failed", added: 0, error: "Remote document disappeared" }]);
});

test("CLI sync-all renders failed resources in JSON output", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "sync-all", "--output", "json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ALL_FAILED: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), [{ ...downloadedResultJson, action: "failed", added: 0, error: "Remote document disappeared" }]);
  assert.equal(execution.stderr, "");
});

test("sync Markdown output labels zero-diff syncs as synced", async () => {
  const noChange = { ...downloadedResult, summary: { ...downloadedResult.summary, action: "synced", added: 0, modified: 0, removed: 0 } };
  const noChangeRoot = createRoot(Object.freeze({ ...createFakeWire(), sync: async () => noChange }), "/workspace", auth);
  const noChangeCommands = new Map(noChangeRoot.children.map((command) => [command.name, command]));
  const value = await noChangeCommands.get("sync").handler(context({ resource: resource.id }));
  assert.equal(noChangeCommands.get("sync").render.markdown(value), "synced  Document\nlocal:  Document.md");
});

test("CLI resource lookup errors are user-facing", async () => {
  for (const [message, patterns] of [
    ["Resource path not found: missing.md", [/resource not found/, /path: missing\.md/]],
    ["Resource path is not registered: draft.md", [/resource not registered/, /path: draft\.md/]],
    ["Resource URL not found: https://notion.test/missing", [/resource not found/, /url: https:\/\/notion\.test\/missing/]],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "missing.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI resource lookup errors keep interpolated values on one display line", async () => {
  const badPath = "Folder\nDocument\tMissing.md";
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "missing.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: `Resource path not found: ${badPath}` } }),
    (error) => {
      assert.match(error.stdout, /resource not found/);
      assert.match(error.stdout, /path: Folder Document Missing\.md/);
      assert.doesNotMatch(error.stdout, /run: wire list/);
      assert.doesNotMatch(error.stdout, /Folder\nDocument|Document\tMissing/);
      assert.doesNotMatch(error.stdout, /Use --debug|for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "detach", "https://example.com/a", "--json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_DETACH_ERROR: "Resource URL not found: https://example.com/a\nnext\tpart" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), jsonError("resource not found\nurl: https://example.com/a next part"));
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "missing.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: "Ambiguous resource path Folder\nDocument.md: notion:one\ncontinued, notion:two. Use a resource id or URL." } }),
    (error) => {
      assert.match(error.stdout, /ambiguous resource/);
      assert.match(error.stdout, /path: Folder Document\.md/);
      assert.match(error.stdout, /matches: notion:one continued, notion:two/);
      assert.match(error.stdout, /use: resource id or URL/);
      assert.doesNotMatch(error.stdout, /Folder\nDocument|one\ncontinued/);
      assert.doesNotMatch(error.stdout, /Use --debug|for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI watch resource lookup errors are user-facing", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "watch", "missing.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_WATCH_ERROR: "Resource path not found: missing.md" } }),
    (error) => {
      assert.match(error.stdout, /resource not found/);
      assert.match(error.stdout, /path: missing\.md/);
      assert.doesNotMatch(error.stdout, /run: wire list/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI missing workspace errors are user-facing", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync-all"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ALL_ERROR: "Wire workspace not initialized. Run `wire init` or `wire <url>` first." } }),
    (error) => {
      assert.match(error.stdout, /workspace not initialized/);
      assert.match(error.stdout, /run: wire init/);
      assert.match(error.stdout, /attach: wire <url>/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "switch-db"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SWITCH_DB_ERROR: "Wire workspace not initialized. Run `wire init` or `wire <url>` first." } }),
    (error) => {
      assert.match(error.stdout, /workspace not initialized/);
      assert.match(error.stdout, /run: wire init/);
      assert.match(error.stdout, /attach: wire <url>/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI init conflict errors are user-facing", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "init", "--backend", "files"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_INIT_ERROR: "Wire workspace already initialized with sqlite registry at registry.sqlite3. Existing registries are not overwritten." } }),
    (error) => {
      assert.match(error.stdout, /workspace already initialized/);
      assert.match(error.stdout, /backend: sqlite/);
      assert.match(error.stdout, /registry: registry\.sqlite3/);
      assert.match(error.stdout, /kept: existing registry/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI operation user errors honor JSON output", async () => {
  for (const [args, expected, env] of [
    [["sync", "missing.md", "--json"], jsonError("resource not found\npath: missing.md"), { WIRE_FAKE_SYNC_ERROR: "Resource path not found: missing.md" }],
    [["download", "https://example.com", "--output", "json"], jsonError("unsupported source\nurl: https://example.com/\nsupported: Asana, ChatGPT, Gmail, Google Docs/Sheets, Notion, Slack, Zoom"), { WIRE_FAKE_DOWNLOAD_ERROR: "Unsupported source URL: https://example.com/" }],
    [["preview", "https://example.com", "--json"], jsonError("unsupported source\nurl: https://example.com/\nsupported: Asana, ChatGPT, Gmail, Google Docs/Sheets, Notion, Slack, Zoom"), { WIRE_FAKE_PREVIEW_ERROR: "Unsupported source URL: https://example.com/" }],
    [["sync", "ambiguous.md", "--json"], jsonError("ambiguous resource\npath: ambiguous.md\nmatches: notion:one, notion:two\nuse: resource id or URL"), { WIRE_FAKE_SYNC_ERROR: "Ambiguous resource path ambiguous.md: notion:one, notion:two. Use a resource id or URL." }],
    [["google-docs", "status", "--json"], jsonError("login required\nservice: Google Docs/Sheets\nrun: wire google-docs login"), { WIRE_FAKE_AUTH_STATUS_ERROR: "google-docs cookie authentication is missing or expired. Run `wire google-docs login` once; other commands reuse saved cookies." }],
    [["sync", "Document.md", "--json"], jsonError("download failed\nservice: ChatGPT\nlogin: wire chatgpt login\ndetail: forbidden"), { WIRE_FAKE_SYNC_ERROR: "ChatGPT conversation download failed. Run `wire chatgpt login`. forbidden" }],
    [["sync", "Document.md", "--json"], jsonError("export failed\nservice: Google Docs/Sheets\nsource: Google Docs Markdown\nstatus: HTTP 404"), { WIRE_FAKE_SYNC_ERROR: "Google Docs Markdown export failed: HTTP 404" }],
    [["sync", "Document.md", "--json"], jsonError("save failed\nservice: Google Docs/Sheets\nsource: Google Sheets\ndetail: unexpected response"), { WIRE_FAKE_SYNC_ERROR: "Google Sheets save failed: unexpected response" }],
    [["sync", "Document.md", "--json"], jsonError("sync conflict\nservice: Google Docs/Sheets\nsource: Google Docs\nresolve: edit Google Docs or local Markdown, then sync again"), { WIRE_FAKE_SYNC_ERROR: "Google Docs changed remotely and locally. Resolve the conflict in Google Docs or the local Markdown file before syncing again." }],
    [["sync", "Document.md", "--json"], jsonError("formula-like cell blocked\nservice: Google Docs/Sheets\nsource: Google Sheets\ncell: row 2, column 2\nresolve: prefix with an apostrophe or rewrite as plain text"), { WIRE_FAKE_SYNC_ERROR: "Google Sheets sync cannot upload formula-like cell text at row 2, column 2\nPrefix it with an apostrophe or rewrite it as plain text before syncing." }],
    [["sync", "Document.md", "--json"], jsonError("api failed\nservice: Slack\nmethod: conversations.replies\ndetail: channel_not_found"), { WIRE_FAKE_SYNC_ERROR: "Slack API conversations.replies failed: channel_not_found" }],
    [["sync", "Document.md", "--json"], jsonError("api failed\nservice: Zoom\noperation: file batch_get\nstatus: HTTP 403\ndetail: {\"error\":\"denied\"}"), { WIRE_FAKE_SYNC_ERROR: "Zoom Hub file batch_get failed: HTTP 403 {\"error\":\"denied\"}" }],
    [["sync", "Document.md", "--json"], jsonError("local markdown invalid\nservice: Asana\nline: 4\ndetail: not a task"), { WIRE_FAKE_SYNC_ERROR: "Unsupported Asana Markdown at line 4: not a task" }],
    [["sync", "Document.md", "--json"], jsonError("sync conflict\nservice: Notion\nresolve: edit Notion or local Markdown, then sync again"), { WIRE_FAKE_SYNC_ERROR: "Markdown and Notion changed since last sync" }],
    [["switch-db", "--json"], jsonError("workspace not initialized\nrun: wire init\nattach: wire <url>"), { WIRE_FAKE_SWITCH_DB_ERROR: "Wire workspace not initialized. Run `wire init` or `wire <url>` first." }],
    [["init", "--backend", "files", "--json"], jsonError("workspace already initialized\nbackend: sqlite\nregistry: registry.sqlite3\nkept: existing registry"), { WIRE_FAKE_INIT_ERROR: "Wire workspace already initialized with sqlite registry at registry.sqlite3. Existing registries are not overwritten." }],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1", ...env } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), expected);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI object-shaped operation user errors are readable", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "missing.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_OBJECT_MESSAGE_ERROR: "Resource path not found: missing.md" } }),
    (error) => {
      assert.match(error.stdout, /resource not found/);
      assert.match(error.stdout, /path: missing\.md/);
      assert.doesNotMatch(error.stdout, /run: wire list/);
      assert.doesNotMatch(error.stdout, /\[object Object\]|Use --debug/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "missing.md", "--json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_OBJECT_MESSAGE_ERROR: "Resource path not found: missing.md" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), jsonError("resource not found\npath: missing.md"));
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI unknown object-shaped operation errors avoid object placeholders", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_OBJECT_ERROR: "remote returned malformed payload" } }),
    (error) => {
      assert.match(error.stdout, /"error":"remote returned malformed payload"/);
      assert.doesNotMatch(error.stdout, /\[object Object\]/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI missing positional errors render once without raw stderr", async () => {
  for (const [command, argument] of [["attach", "url"], ["preview", "url"], ["sync", "resource"], ["download", "url"], ["detach", "resource"], ["open", "resource"], ["watch", "file"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, command], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Missing required argument: ${argument}`));
      assert.match(error.stdout, usageHelp(`wire ${command} --help`));
      assert.equal(error.stdout.match(/Missing required argument/g).length, 1);
      assert.doesNotMatch(error.stdout, /error: missing required argument/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI pre-parse errors honor JSON output", async () => {
  for (const [args, expected] of [
    [["sync", "--json"], { error: { message: "Missing required argument: resource", usage: "wire sync --help" } }],
    [["download", "--json"], { error: { message: "Missing required argument: url", usage: "wire download --help" } }],
    [["detach", "--json"], { error: { message: "Missing required argument: resource", usage: "wire detach --help" } }],
    [["sync", "Document.md", "extra", "--json"], { error: { message: "Too many arguments: expected 1 argument, got 2.", usage: "wire sync --help" } }],
    [["google-docs", "frobnicate", "--json"], { error: { message: "Unknown command: frobnicate", usage: "wire google-docs --help" } }],
    [["preview", "frobnicate", "--json"], { error: { message: "Expected source URL: frobnicate", usage: "wire preview --help" } }],
    [["preview", "docs.google.com/spreadsheets/d/sheet/edit", "--json"], { error: { message: "Expected source URL: docs.google.com/spreadsheets/d/sheet/edit\nAdd `https://` and retry.", usage: "wire preview --help" } }],
    [["frobnicate", "--json"], { error: { message: "Expected source URL or command: frobnicate", usage: "wire --help" } }],
    [["docs.google.com/spreadsheets/d/sheet/edit", "--json"], { error: { message: "Expected source URL or command: docs.google.com/spreadsheets/d/sheet/edit\nAdd `https://` and retry.", usage: "wire --help" } }],
    [["sync", "docs.google.com/spreadsheets/d/sheet/edit", "--json"], { error: { message: "Expected resource URL or Markdown path: docs.google.com/spreadsheets/d/sheet/edit\nAdd `https://` and retry.", usage: "wire sync --help" } }],
    [["download", "docs.google.com/spreadsheets/d/sheet/edit", "--json"], { error: { message: "Expected source URL: docs.google.com/spreadsheets/d/sheet/edit\nAdd `https://` and retry.", usage: "wire download --help" } }],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), expected);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI pre-parse Markdown errors keep interpolated values on one display line", async () => {
  const badUrl = "frobnicate\nnext\tpart";
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "preview", badUrl], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL: frobnicate next part/);
      assert.doesNotMatch(error.stdout, /frobnicate\nnext|\tnext|next\tpart/);
      assert.match(error.stdout, usageHelp("wire preview --help"));
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "preview", badUrl, "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: `Expected source URL: ${badUrl}`, usage: "wire preview --help" } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI option Markdown errors keep interpolated values on one display line", async () => {
  const badOutput = "xml\nnext\tpart";
  const badDebug = "trace\nnext\tpart";
  const badBackend = "file\nnext\tpart";
  for (const [args, expected, usage] of [
    [["sync", "Document.md", "--output", badOutput], `Expected one of: md, markdown, json, rich, got "xml next part"`, "wire sync --help"],
    [["sync", "Document.md", `--debug=${badDebug}`], `Expected one of: raw, got "trace next part"`, "wire sync --help"],
    [["init", `--backend=${badBackend}`], `Expected one of: sqlite, files, got "file next part"`, "wire init --help"],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(error.stdout, /xml\nnext|trace\nnext|file\nnext|next\tpart/);
      assert.match(error.stdout, usageHelp(usage));
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md", "--output", badOutput, "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: `Invalid value for "--output"\nExpected one of: md, markdown, json, rich, got "${badOutput}"`, usage: "wire sync --help" } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI excess positional errors render before side effects", async () => {
  for (const [args, helpTarget, expected, received] of [
    [["sync", "Document.md", "extra"], "sync", 1, 2],
    [["sync", "Document.md", "--debug", "raw", "extra"], "sync", 1, 2],
    [["sync-all", "extra"], "sync-all", 0, 1],
    [["switch-db", "extra"], "switch-db", 0, 1],
    [["google-docs", "login", "extra"], "google-docs login", 0, 1],
    [["https://www.notion.so/page-1", "extra"], "attach", 1, 2],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Too many arguments: expected ${expected === 0 ? "none" : `${expected} argument${expected === 1 ? "" : "s"}`}, got ${received}\\.`));
      assert.match(error.stdout, usageHelp(`wire ${helpTarget} --help`));
      assert.doesNotMatch(error.stdout, /error: too many arguments/);
      assert.doesNotMatch(error.stdout, /Resource not found/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI invalid output format renders once without raw commander help", async () => {
  for (const [args, usage, format] of [
    [["sync", "Document.md", "--output", "xml"], "wire sync --help", "xml"],
    [["sync", "--output", "xml"], "wire sync --help", "xml"],
    [["--output", "yaml"], "wire --help", "yaml"],
    [["https://www.notion.so/page-1", "--output=yaml"], "wire attach --help", "yaml"],
    [["sync", "Document.md", "--markdown", "--output=xml"], "wire sync --help", "xml"],
  ]) {
    await assert.rejects(
      () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
      (error) => {
        assert.match(error.stdout, /Invalid value for "--output"/);
        assert.match(error.stdout, new RegExp(`Expected one of: md, markdown, json, rich, got "${format}"`));
        assert.match(error.stdout, usageHelp(usage));
        assert.doesNotMatch(error.stdout, /^Usage: wire/m);
        assert.equal(error.stderr, "");
        return true;
      },
    );
  }
});

test("CLI missing output format renders once without raw commander help", async () => {
  for (const [args, usage] of [
    [["--output"], "wire --help"],
    [["sync", "Document.md", "--output"], "wire sync --help"],
    [["sync", "--output"], "wire sync --help"],
  ]) {
    await assert.rejects(
      () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
      (error) => {
        assert.match(error.stdout, /Missing value for "--output"/);
        assert.match(error.stdout, /Expected one of: md, markdown, json, rich/);
        assert.match(error.stdout, usageHelp(usage));
        assert.doesNotMatch(error.stdout, /got "--help"|^Usage: wire/m);
        assert.equal(error.stderr, "");
        return true;
      },
    );
  }
});

test("CLI invalid init backend renders once without raw commander help", async () => {
  for (const [args, message] of [
    [["init", "--backend"], "Missing value for \"--backend\""],
    [["init", "--backend=file"], "Invalid value for \"--backend\""],
    [["init", "--backend", "file"], "Invalid value for \"--backend\""],
  ]) {
    await assert.rejects(
      () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
      (error) => {
        assert.match(error.stdout, new RegExp(message));
        assert.match(error.stdout, /Expected one of: sqlite, files/);
        assert.match(error.stdout, usageHelp("wire init --help"));
        assert.doesNotMatch(error.stdout, /error: option|Did you mean|^Usage: wire/m);
        assert.equal(error.stderr, "");
        return true;
      },
    );
  }
});

test("CLI invalid init backend honors JSON output", async () => {
  for (const [args, expected] of [
    [["init", "--backend", "--json"], { error: { message: "Missing value for \"--backend\"\nExpected one of: sqlite, files", usage: "wire init --help" } }],
    [["init", "--backend=file", "--json"], { error: { message: "Invalid value for \"--backend\"\nExpected one of: sqlite, files, got \"file\"", usage: "wire init --help" } }],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), expected);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI init backend option does not mask unknown options on other commands", async () => {
  for (const [args, usage] of [
    [["sync", "--backend"], "wire sync --help"],
    [["detach", "--backend", "sqlite"], "wire detach --help"],
    [["google-docs", "status", "--backend=sqlite"], "wire google-docs status --help"],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Unknown option "--backend/);
      assert.match(error.stdout, usageHelp(usage));
      assert.doesNotMatch(error.stdout, /Missing required argument|Too many arguments/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI init backend option unknown command errors honor JSON output", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "--backend", "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), jsonError("Unknown option \"--backend\".\nRun wire sync --help for usage."));
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth paste option does not mask unknown options on other commands", async () => {
  for (const [args, usage] of [
    [["sync", "--paste"], "wire sync --help"],
    [["detach", "--paste"], "wire detach --help"],
    [["google-docs", "status", "--paste"], "wire google-docs status --help"],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Unknown option "--paste"/);
      assert.match(error.stdout, usageHelp(usage));
      assert.doesNotMatch(error.stdout, /Missing required argument|Too many arguments/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI URL shorthand unknown options point to attach help", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, resource.urls[0], "--frobnicate"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Unknown option "--frobnicate"\./);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, resource.urls[0], "--frobnicate", "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), jsonError("Unknown option \"--frobnicate\".\nRun wire --help for usage."));
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth paste unknown command errors honor JSON output", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "--paste", "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), jsonError("Unknown option \"--paste\".\nRun wire sync --help for usage."));
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI invalid debug mode renders once without raw commander help", async () => {
  for (const [args, usage, mode] of [
    [["--debug=foo"], "wire --help", "foo"],
    [["sync", "Document.md", "--debug=foo"], "wire sync --help", "foo"],
    [["sync", "--debug=foo"], "wire sync --help", "foo"],
    [["--debug", "noisy", "list"], "wire --help", "noisy"],
    [["--debug="], "wire --help", ""],
  ]) {
    await assert.rejects(
      () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
      (error) => {
        if (mode === "") {
          assert.match(error.stdout, /Missing value for "--debug"/);
          assert.match(error.stdout, /Expected one of: raw/);
        } else {
          assert.match(error.stdout, /Invalid value for "--debug"/);
          assert.match(error.stdout, new RegExp(`Expected one of: raw, got "${mode}"`));
        }
        assert.match(error.stdout, usageHelp(usage));
        assert.doesNotMatch(error.stdout, /error: option|^Usage: wire/m);
        assert.equal(error.stderr, "");
        return true;
      },
    );
  }
});

test("CLI invalid debug mode honors JSON output", async () => {
  for (const [args, usage, mode] of [[["sync", "--debug=foo", "--json"], "wire sync --help", "foo"], [["google-docs", "--debug=foo", "--json"], "wire google-docs --help", "foo"], [["--debug", "noisy", "--json"], "wire --help", "noisy"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: `Invalid value for "--debug"\nExpected one of: raw, got "${mode}"`, usage } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI invalid output errors honor the last valid output format", async () => {
  for (const [args, usage] of [[["--json", "--output", "yaml"], "wire --help"], [["sync", "--json", "--output", "yaml"], "wire sync --help"], [["sync", "--output", "yaml", "--json"], "wire sync --help"], [["sync", "--json", "--output"], "wire sync --help"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.equal(JSON.parse(error.stdout).error.usage, usage);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--json", "--output", "yaml", "--markdown"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Invalid value for "--output"/);
      assert.doesNotMatch(error.stdout, /^\{/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google sync conflicts are user-facing", async () => {
  for (const [message, patterns, rawPattern] of [
    ["Google Docs changed remotely and locally. Resolve the conflict in Google Docs or the local Markdown file before syncing again.", [/sync conflict/, /service: Google Docs\/Sheets/, /source: Google Docs/, /resolve: edit Google Docs or local Markdown, then sync again/], /Google Docs changed remotely and locally/],
    ["Google Sheets changed remotely and locally. Resolve the conflict in Google Sheets or the local Markdown file before syncing again.", [/sync conflict/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /resolve: edit Google Sheets or local Markdown, then sync again/], /Google Sheets changed remotely and locally/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google local validation failures are user-facing", async () => {
  for (const [message, patterns, rawPattern] of [
    ["Google Docs local edit cannot be mapped to the live document text", [/local edit not mappable/, /service: Google Docs\/Sheets/, /source: Google Docs/, /resolve: edit Google Docs or simplify local Markdown/], /local edit cannot be mapped/],
    ["Google Sheets sync requires a Markdown table", [/local table invalid/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /detail: requires a Markdown table/], /Google Sheets sync requires/],
    ["Google Sheets sync requires a Markdown table separator row", [/local table invalid/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /detail: requires a Markdown table separator row/], /Google Sheets sync requires/],
    ["Google Sheets sync requires every Markdown table row to have the same number of cells", [/local table invalid/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /detail: requires every Markdown table row to have the same number of cells/], /Google Sheets sync requires/],
    ["Google Sheets sync cannot upload formula-like cell text at row 2, column 2\nPrefix it with an apostrophe or rewrite it as plain text before syncing.", [/formula-like cell blocked/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /cell: row 2, column 2/, /resolve: prefix with an apostrophe or rewrite as plain text/], /Google Sheets sync cannot upload formula-like cell text/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google Docs URL with no cookies reports login without Google env vars or browser capture", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-missing-google-docs-auth");
  const project = resolve(root, "project");
  const home = resolve(root, "home");
  await rm(root, { recursive: true, force: true });
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => execFileAsync(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "https://docs.google.com/spreadsheets/d/sheet/edit#gid=7"], { cwd: project, env: { ...process.env, HOME: home, NO_COLOR: "1", GOOGLE_CREDENTIALS_FILE: "", GOOGLE_TOKEN_FILE: "", WIRE_NODE_NO_WARNINGS_REEXEC: "1", WIRE_REPOSITORY_ROOT: project }, timeout: 3000 }),
    (error) => {
      assert.match(error.stdout, /login required/);
      assert.match(error.stdout, /service: Google Docs\/Sheets/);
      assert.match(error.stdout, /run: wire google-docs login/);
      assert.doesNotMatch(error.stdout, /GOOGLE_CREDENTIALS_FILE|GOOGLE_TOKEN_FILE|GOOGLE_DOCS_TOKEN_FILE/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth status with no cookies reports login without debug noise", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-missing-google-docs-status");
  const project = resolve(root, "project");
  const home = resolve(root, "home");
  await rm(root, { recursive: true, force: true });
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => execFileAsync(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "google-docs", "status"], { cwd: project, env: { ...process.env, HOME: home, NO_COLOR: "1", GOOGLE_CREDENTIALS_FILE: "", GOOGLE_TOKEN_FILE: "", WIRE_NODE_NO_WARNINGS_REEXEC: "1", WIRE_REPOSITORY_ROOT: project }, timeout: 3000 }),
    (error) => {
      assert.match(error.stdout, /login required/);
      assert.match(error.stdout, /service: Google Docs\/Sheets/);
      assert.match(error.stdout, /run: wire google-docs login/);
      assert.doesNotMatch(error.stdout, /GOOGLE_CREDENTIALS_FILE|GOOGLE_TOKEN_FILE|GOOGLE_DOCS_TOKEN_FILE/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google expired cookie sync failures are user-facing", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: "google-docs cookie authentication is missing or expired. Run `wire google-docs login` once; other commands reuse saved cookies." } }),
    (error) => {
      assert.match(error.stdout, /login required/);
      assert.match(error.stdout, /service: Google Docs\/Sheets/);
      assert.match(error.stdout, /run: wire google-docs login/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI URL auth failures omit internal fetch usage", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "https://hub.zoom.us/doc/BxttW9eMTd2QDRNz6tWJ8g?from=hub&skipCheck=1"], { env: { ...colorEnv(), WIRE_FAKE_ATTACH_ERROR: "Zoom authentication is missing or expired. Run `wire zoom login` once; other commands reuse saved cookies." } }),
    (error) => {
      assert.match(error.stdout, /login required/);
      assert.match(error.stdout, /service: Zoom/);
      assert.match(error.stdout, /run: wire zoom login/);
      assert.match(error.stdout, /\x1B\[/);
      assert.doesNotMatch(error.stdout, /authentication missing or expired/);
      assert.doesNotMatch(error.stdout, /wire fetch --help|for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google malformed export failures are user-facing", async () => {
  for (const [message, patterns] of [
    ["Google Docs Markdown export did not include a filename", [/export failed/, /service: Google Docs\/Sheets/, /source: Google Docs Markdown/, /detail: missing filename/]],
    ["Google Docs Markdown export failed: HTTP 404", [/export failed/, /service: Google Docs\/Sheets/, /source: Google Docs Markdown/, /status: HTTP 404/]],
    ["Google Sheets CSV export failed: HTTP 500", [/export failed/, /service: Google Docs\/Sheets/, /source: Google Sheets CSV/, /status: HTTP 500/]],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, /Google Docs Markdown export failed|Google Sheets CSV export failed|did not include a filename/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google editor metadata failures are user-facing", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: "Google Docs editor did not include save metadata" } }),
    (error) => {
      assert.match(error.stdout, /save metadata missing/);
      assert.match(error.stdout, /service: Google Docs\/Sheets/);
      assert.match(error.stdout, /source: Google Docs editor/);
      assert.doesNotMatch(error.stdout, /Google Docs editor did not include save metadata/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI Google save failures are user-facing", async () => {
  for (const [message, patterns, rawPattern] of [
    ["Google Docs save failed: missing revision ranges", [/save failed/, /service: Google Docs\/Sheets/, /source: Google Docs/, /detail: missing revision ranges/], /Google Docs save failed/],
    ["Google Sheets save failed: unexpected response", [/save failed/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /detail: unexpected response/], /Google Sheets save failed/],
    ["Google Docs save verification failed", [/save verification failed/, /service: Google Docs\/Sheets/, /source: Google Docs/], /Google Docs save verification failed/],
    ["Google Sheets save verification failed", [/save verification failed/, /service: Google Docs\/Sheets/, /source: Google Sheets/], /Google Sheets save verification failed/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const [message, patterns, rawPattern] of [
    ["Google Docs sync cannot upload formatting-only Markdown edits", [/local edit not uploadable/, /service: Google Docs\/Sheets/, /source: Google Docs/, /detail: formatting-only Markdown edit/], /Google Docs sync cannot upload formatting-only Markdown edits/],
    ["Google sync base must include markdown", [/sync base invalid/, /service: Google Docs\/Sheets/, /detail: must include markdown/], /Google sync base must include markdown/],
    ["Google Sheets sync base rows must be arrays", [/sync base invalid/, /service: Google Docs\/Sheets/, /source: Google Sheets/, /detail: rows must be arrays/], /Google Sheets sync base rows must be arrays/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI provider operation failures are user-facing", async () => {
  for (const [message, patterns, rawPattern] of [
    ["Asana API /tasks/2 failed: HTTP 404 Not found", [/api failed/, /service: Asana/, /request: \/tasks\/2/, /status: HTTP 404/, /detail: Not found/], /Asana API \/tasks\/2 failed/],
    ["POST /tasks failed: 403 Forbidden", [/api failed/, /service: Asana/, /request: POST \/tasks/, /status: HTTP 403/, /detail: Forbidden/], /POST \/tasks failed/],
    ["Gmail API thread fetch failed: HTTP 403 Request had insufficient authentication scopes.", [/api failed/, /service: Gmail/, /operation: thread fetch/, /status: HTTP 403/, /detail: Request had insufficient authentication scopes\./], /Gmail API thread fetch failed/],
    ["Slack API conversations.replies failed: channel_not_found", [/api failed/, /service: Slack/, /method: conversations\.replies/, /detail: channel_not_found/], /Slack API conversations\.replies failed/],
    ["Zoom Hub file batch_get failed: HTTP 403 {\"error\":\"denied\"}", [/api failed/, /service: Zoom/, /operation: file batch_get/, /status: HTTP 403/, /detail: \{"error":"denied"\}/], /Zoom Hub file batch_get failed/],
    ["Zoom Hub file abc was not returned by batch_get", [/file missing/, /service: Zoom/, /file: abc/, /operation: batch_get/], /Zoom Hub file abc was not returned/],
    ["POST saveTransactionsFanout failed: 409 conflict", [/api failed/, /service: Notion/, /request: POST saveTransactionsFanout/, /status: HTTP 409/, /detail: conflict/], /POST saveTransactionsFanout failed/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const [message, patterns, rawPattern] of [
    ["Unsupported Asana Markdown at line 4: not a task", [/local markdown invalid/, /service: Asana/, /line: 4/, /detail: not a task/], /Unsupported Asana Markdown/],
    ["Unknown Asana identity 999. New entries must not include a URL.", [/unknown identity/, /service: Asana/, /identity: 999/, /resolve: remove URL from new entries/], /Unknown Asana identity/],
    ["Conflicting Asana edits: task:400.name", [/sync conflict/, /service: Asana/, /field: task:400\.name/, /resolve: edit Asana or local Markdown, then sync again/], /Conflicting Asana edits/],
    ["Markdown document requires a first heading", [/local markdown invalid/, /service: Notion/, /detail: missing first heading/], /Markdown document requires a first heading/],
    ["Markdown and Notion changed since last sync", [/sync conflict/, /service: Notion/, /resolve: edit Notion or local Markdown, then sync again/], /Markdown and Notion changed since last sync/],
  ]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: message } }),
    (error) => {
      for (const pattern of patterns) assert.match(error.stdout, pattern);
      assert.doesNotMatch(error.stdout, rawPattern);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "sync", "Document.md"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_SYNC_ERROR: "ChatGPT conversation download failed. Run `wire chatgpt login`. forbidden" } }),
    (error) => {
      assert.match(error.stdout, /download failed/);
      assert.match(error.stdout, /service: ChatGPT/);
      assert.match(error.stdout, /login: wire chatgpt login/);
      assert.match(error.stdout, /detail: forbidden/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth paste verification failures are user-facing", async () => {
  const child = spawn(process.execPath, [fixture, "google-docs", "login", "--paste"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_PASTE_ERROR: "google-docs cookie authentication failed. Run `wire google-docs login` once; other commands reuse saved cookies." }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end("Cookie: bad=value");
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.notEqual(exitCode, 0);
  assert.match(stdout, /login required/);
  assert.match(stdout, /service: Google Docs\/Sheets/);
  assert.match(stdout, /run: wire google-docs login/);
  assert.doesNotMatch(stdout, /Use --debug/);
  assert.doesNotMatch(stdout, /for usage/);
  assert.equal(stderr, "");
});

test("CLI auth status Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "google-docs", "status", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "Google Docs/Sheets authenticated\nservice: google-docs\n");
});

test("CLI auth status Markdown output renders nested identity fields readably", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "zoom", "status", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_NESTED_IDENTITY: "1" } });
  assert.equal(execution.stdout, "Zoom authenticated\nservice: zoom\naccount: {\"id\":\"account\",\"plan\":\"team\"}\nscopes:  read, write\n");
  assert.doesNotMatch(execution.stdout, /\[object Object\]/);
  assert.doesNotMatch(execution.stdout, /^[^:\n]+ +:/m);
  const json = await execFileAsync(process.execPath, [fixture, "zoom", "status", "--output", "json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_NESTED_IDENTITY: "1" } });
  assert.deepEqual(JSON.parse(json.stdout), { service: "zoom", identity: { service: "zoom", account: { id: "account", plan: "team" }, scopes: ["read", "write"] } });
});

test("CLI auth status Markdown output keeps identity fields on one display line", async () => {
  assert.equal(wirePresentation.authStatus.markdown({ service: "google-docs", identity: { user: { displayName: "Person\nName", emailAddress: "person\n@example.com", permissionId: "permission\n1" } } }), "Google Docs/Sheets authenticated\nname:          Person Name\nemail:         person @example.com\npermission_id: permission 1");
  assert.deepEqual(wirePresentation.authStatus.json({ service: "zoom", identity: { "account\nid": "account\nA1", scopes: ["read\none", "write\ttwo"] } }), { service: "zoom", identity: { "account\nid": "account\nA1", scopes: ["read\none", "write\ttwo"] } });
  const google = await execFileAsync(process.execPath, [fixture, "google-docs", "status", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_MESSY_IDENTITY: "1" } });
  assert.equal(google.stdout, "Google Docs/Sheets authenticated\nname:          Person Name\nemail:         person @example.com\npermission_id: permission 1\n");
  const zoom = await execFileAsync(process.execPath, [fixture, "zoom", "status", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_MESSY_IDENTITY: "1" } });
  assert.equal(zoom.stdout, "Zoom authenticated\naccount id: account A1\nscopes:     read one, write two\n");
  assert.doesNotMatch(zoom.stdout, /\\n|\\t/);
  assert.doesNotMatch(zoom.stdout, /\[object Object\]/);
  assert.doesNotMatch(zoom.stdout, /^[^:\n]+ +:/m);
  const json = await execFileAsync(process.execPath, [fixture, "zoom", "status", "--output", "json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_MESSY_IDENTITY: "1" } });
  assert.deepEqual(JSON.parse(json.stdout), { service: "zoom", identity: { "account\nid": "account\nA1", scopes: ["read\none", "write\ttwo"] } });
});

test("CLI auth status Markdown output handles empty identity payloads", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "zoom", "status", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_EMPTY_IDENTITY: "1" } });
  assert.equal(execution.stdout, "Zoom authenticated\n");
});

test("CLI output shorthand flags map to Toolcraft output formats", async () => {
  const statusJson = await execFileAsync(process.execPath, [fixture, "google-docs", "status", "--json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(statusJson.stdout), { service: "google-docs", identity: { service: "google-docs" } });
  const statusMarkdown = await execFileAsync(process.execPath, [fixture, "google-docs", "status", "--markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(statusMarkdown.stdout, "Google Docs/Sheets authenticated\nservice: google-docs\n");
  const openMarkdown = await execFileAsync(process.execPath, [fixture, "open", resource.id, "--md"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(openMarkdown.stdout, "opened  Document\nremote: https://www.notion.so/page-1\nlocal:  Document.md\nid:     notion:page-1\n");
});

test("CLI auth help uses service display names", async () => {
  const google = await execFileAsync(process.execPath, [fixture, "google-docs", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(google.stdout, /Check saved Google Docs\/Sheets login\./);
  assert.match(google.stdout, /Capture cookies once; normal commands reuse saved cookies\./);
  assert.match(google.stdout, /Delete saved Google Docs\/Sheets cookies\./);
  assert.doesNotMatch(google.stdout, /Chrome|Use --paste|google-docs login|saved google-docs cookies|~\/\.wire\/auth/);
  const slack = await execFileAsync(process.execPath, [fixture, "slack", "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(slack.stdout, /Check saved Slack login\./);
  assert.match(slack.stdout, /Capture cookies once; normal commands reuse saved cookies\./);
  assert.match(slack.stdout, /Delete saved Slack cookies\./);
  assert.doesNotMatch(slack.stdout, /Chrome|Use --paste|slack login|saved slack cookies|auth\.test/);
});

test("CLI Google Docs login exists", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "google-docs", "login", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), { service: "google-docs", identity: { email: "person@example.com" } });
});

test("CLI auth login Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "google-docs", "login", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "Google Docs/Sheets authenticated\nemail: person@example.com\n");
});

test("CLI auth manual capture Markdown output is compact for every service", async () => {
  for (const [service, title] of [["asana", "Asana"], ["chatgpt", "ChatGPT"], ["gmail", "Gmail"], ["google-docs", "Google Docs/Sheets"], ["notion", "Notion"], ["slack", "Slack"], ["zoom", "Zoom"]]) {
    const execution = await execFileAsync(process.execPath, [fixture, service, "login", "--markdown"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_MANUAL_SAVE: service } });
    assert.equal(execution.stdout, `${title} login saved\n`);
  }
});

test("CLI auth login cancellation is user-facing for every service", async () => {
  for (const service of ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, service, "login"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_CANCEL_LOGIN: service } }),
    (error) => {
      assert.match(error.stdout, /Login not saved/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth logout Markdown output is compact", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "google-docs", "logout", "--output", "markdown"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(execution.stdout, "Google Docs/Sheets logged out\n");
});

test("CLI rejects non-Toolcraft output and command shims", async () => {
  for (const args of [
    ["create", resource.urls[0]],
    ["not-a-url"],
    ["sync", "--all"],
    ["--path", "/tmp/wire-target", "init"],
  ]) await assert.rejects(execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }));
});

test("CLI removed command shims point to root help", async () => {
  for (const [command, replacement] of [["auth", "Use `wire <service> status`, `wire <service> login`, or `wire <service> logout`."], ["create", "Use `wire attach <url>` or `wire <url>`."], ["fetch", "Use `wire download <url>`."], ["link", "Use `wire attach <url>` or `wire <url>`."], ["unlink", "Use `wire detach <resource>`."], ["view", "Use `wire preview <url>`."]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, command], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Unknown command: ${command}`));
      assert.match(error.stdout, new RegExp(replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /wire fetch --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI removed auth group is user-facing even with subcommands or help", async () => {
  for (const args of [["auth", "status"], ["auth", "--help"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Unknown command: auth/);
      assert.match(error.stdout, /Use `wire <service> status`, `wire <service> login`, or `wire <service> logout`\./);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI unknown auth subcommands point to service help", async () => {
  for (const [service, args] of [["google-docs", ["google-docs", "frobnicate"]], ["slack", ["slack", "frobnicate", "--output", "yaml"]], ["gmail", ["gmail", "frobnicate", "--debug=foo"]]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Unknown command: frobnicate/);
      assert.match(error.stdout, usageHelp(`wire ${service} --help`));
      assert.doesNotMatch(error.stdout, /Invalid value for "--output"/);
      assert.doesNotMatch(error.stdout, /Invalid value for "--debug"/);
      assert.doesNotMatch(error.stdout, /wire --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth commands after a service separator stay literal", async () => {
  for (const command of ["login", "logout", "status"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "google-docs", "--", command], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_EXTRACT_ERROR: "login extractor must not run" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Unknown command: ${command}`));
      assert.match(error.stdout, usageHelp("wire google-docs --help"));
      assert.doesNotMatch(error.stdout, /authenticated|logged out|Login not saved|Use --debug|wire --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI bare non-URL input points to root help", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "frobnicate"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL or command: frobnicate/);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /wire fetch --help|wire sync frobnicate/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const value of ["./local.md", "missing.md"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, value], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Expected source URL or command: ${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(error.stdout, new RegExp(`Use \`wire sync ${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` for registered Markdown paths\\.`));
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /wire fetch --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "docs.google.com/spreadsheets/d/sheet/edit"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL or command: docs\.google\.com\/spreadsheets\/d\/sheet\/edit/);
      assert.match(error.stdout, /Add `https:\/\/` and retry\./);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /wire sync docs\.google\.com|wire fetch --help|Use --debug/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "missing.md", "--json"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: "Expected source URL or command: missing.md\nUse `wire sync missing.md` for registered Markdown paths.", usage: "wire --help" } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--", "version"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL or command: version/);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /0\.1\.0|wire fetch --help|--version/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--debug", "raw", "--", "sync", "--", "--help"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL or command: sync/);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /downloaded|wire sync --help|## |Usage: `/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const args of [["--json", "--", "sync", "--", "--help"], ["--output", "json", "--", "fetch", "--", "--help"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, ...args], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      const value = args[args.indexOf("--") + 1];
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: `Expected source URL or command: ${value}`, usage: "wire --help" } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const value of ["list", "view"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--", value], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Expected source URL or command: ${value}`));
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /local:|synced:|Use `wire preview <url>`|wire list --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const value of ["--help", "--version", "--output", "--debug"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--", value, "yaml"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Expected source URL or command: ${value}`));
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /Usage:|0\.1\.0|Invalid value for "--output"|Invalid value for "--debug"|wire fetch --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const [value, rewritten] of [["--json", "--output"], ["--md", "--output"], ["--markdown", "--output"], ["-V", "--version"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--", value, "yaml"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Expected source URL or command: ${value}`));
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, new RegExp(`Expected source URL or command: ${rewritten.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.doesNotMatch(error.stdout, /Usage:|0\.1\.0|Invalid value for "--output"|wire fetch --help/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  for (const value of ["list", "sync", "https://www.notion.so/page-1", "raw"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--", "--debug", value], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL or command: --debug/);
      assert.match(error.stdout, usageHelp("wire --help"));
      assert.doesNotMatch(error.stdout, /Expected source URL or command: list|Expected source URL or command: sync|Too many arguments|wire fetch --help|Invalid value for "--debug"/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "--json", "--", "--output", "yaml"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.deepEqual(JSON.parse(error.stdout), { error: { message: "Expected source URL or command: --output", usage: "wire --help" } });
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI source commands reject non-URLs before provider execution", async () => {
  for (const command of ["attach", "download", "preview"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, command, "frobnicate"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL: frobnicate/);
      assert.match(error.stdout, usageHelp(`wire ${command} --help`));
      assert.doesNotMatch(error.stdout, /Invalid URL|Use --debug/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, "preview", "docs.google.com/spreadsheets/d/sheet/edit"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected source URL: docs\.google\.com\/spreadsheets\/d\/sheet\/edit/);
      assert.match(error.stdout, /Add `https:\/\/` and retry\./);
      assert.match(error.stdout, usageHelp("wire preview --help"));
      assert.doesNotMatch(error.stdout, /Invalid URL|Use --debug|Chrome/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI resource commands reject schemeless source-looking URLs before lookup", async () => {
  for (const command of ["sync", "detach", "open"]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, command, "docs.google.com/spreadsheets/d/sheet/edit"], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, /Expected resource URL or Markdown path: docs\.google\.com\/spreadsheets\/d\/sheet\/edit/);
      assert.match(error.stdout, /Add `https:\/\/` and retry\./);
      assert.match(error.stdout, usageHelp(`wire ${command} --help`));
      assert.doesNotMatch(error.stdout, /Resource path not found|Run `wire list`|Use --debug|Chrome/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI resource command separators keep control tokens literal", async () => {
  for (const [command, value, label] of [["sync", "--help", "resource URL or Markdown path"], ["download", "--version", "source URL"], ["detach", "-V", "resource URL or Markdown path"], ["open", "--json", "resource URL or Markdown path"], ["watch", "--help", "Markdown path"]]) await assert.rejects(
    () => execFileAsync(process.execPath, [fixture, command, "--", value], { env: { ...process.env, NO_COLOR: "1" } }),
    (error) => {
      assert.match(error.stdout, new RegExp(`Expected ${label}: ${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(error.stdout, usageHelp(`wire ${command} --help`));
      assert.doesNotMatch(error.stdout, /## |Usage: `|downloaded|opened|Document|0\.1\.0|Invalid value for "--output"|Invalid value for "--debug"/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI unsupported source URLs are user-facing", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-unsupported-source-url");
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => execFileAsync(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "preview", "https://example.com/not-supported"], { cwd: root, env: { ...process.env, NO_COLOR: "1", WIRE_NODE_NO_WARNINGS_REEXEC: "1" }, timeout: 3000 }),
    (error) => {
      assert.match(error.stdout, /unsupported source/);
      assert.match(error.stdout, /url: https:\/\/example\.com\/not-supported/);
      assert.match(error.stdout, /supported: Asana, ChatGPT, Gmail, Google Docs\/Sheets, Notion, Slack, Zoom/);
      assert.doesNotMatch(error.stdout, /for usage/);
      assert.doesNotMatch(error.stdout, /Use --debug/);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});

test("CLI auth login paste reads cookies from stdin", async () => {
  const child = spawn(process.execPath, [fixture, "slack", "login", "--paste", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end("Cookie: a=b");
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.equal(exitCode, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), { service: "slack", identity: { contents: "Cookie: a=b" } });
});

test("CLI ChatGPT login uses the shared extractor by default", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "chatgpt", "login", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), { service: "chatgpt", identity: { account_id: "account" } });
});

test("CLI ChatGPT login paste reads cookies from stdin", async () => {
  const child = spawn(process.execPath, [fixture, "chatgpt", "login", "--paste", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end("Cookie: a=b");
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.equal(exitCode, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), { service: "chatgpt", identity: { contents: "Cookie: a=b" } });
});


test("native toolcraft help exposes Wire's enabled global controls", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "--help"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.doesNotMatch(execution.stdout, /approvals/);
  assert.match(execution.stdout, /<url>/);
  assert.doesNotMatch(execution.stdout, /^\s+view(?:\s|$)/m);
  assert.doesNotMatch(execution.stdout, /^\s+create(?:\s|$)/m);
  assert.doesNotMatch(execution.stdout, /^\s+list\s+List registered resources without syncing them\./m);
  assert.doesNotMatch(execution.stdout, /^\s+show <resource>\s+Show registered resource details without opening the source URL\./m);
  assert.doesNotMatch(execution.stdout, /switch-db/);
  assert.doesNotMatch(execution.stdout, /--path/);
  assert.match(execution.stdout, /--output/);
  assert.doesNotMatch(execution.stdout, /--yes/);
  assert.doesNotMatch(execution.stdout, /--debug/);
  assert.doesNotMatch(execution.stderr, /SQLite is an experimental feature/);
});

test("CLI accepts debug after positional URL", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, resource.urls[0], "--debug", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), resultJson);
});

test("CLI accepts debug before default URL", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, "--debug", resource.urls[0], "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(execution.stdout), resultJson);
  const equals = await execFileAsync(process.execPath, [fixture, `--debug=${resource.urls[0]}`, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(equals.stdout), resultJson);
});

test("CLI default URL attach does not invoke login extraction", async () => {
  const execution = await execFileAsync(process.execPath, [fixture, resource.urls[0], "--output", "json"], { env: { ...process.env, NO_COLOR: "1", WIRE_FAKE_AUTH_EXTRACT_ERROR: "login extractor must not run" } });
  assert.deepEqual(JSON.parse(execution.stdout), resultJson);
});

test("CLI accepts debug before commands", async () => {
  const sync = await execFileAsync(process.execPath, [fixture, "--debug", "sync", resource.id, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(sync.stdout), downloadedResultJson);
  const syncEquals = await execFileAsync(process.execPath, [fixture, "--debug=sync", resource.id, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(syncEquals.stdout), downloadedResultJson);
  const status = await execFileAsync(process.execPath, [fixture, "--debug", "google-docs", "status", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(status.stdout), { service: "google-docs", identity: { service: "google-docs" } });
  const statusEquals = await execFileAsync(process.execPath, [fixture, "--debug=google-docs", "status", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(statusEquals.stdout), { service: "google-docs", identity: { service: "google-docs" } });
});

test("CLI accepts debug around command positionals", async () => {
  const beforeResource = await execFileAsync(process.execPath, [fixture, "sync", "--debug", resource.id, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(beforeResource.stdout), downloadedResultJson);
  const afterResource = await execFileAsync(process.execPath, [fixture, "sync", resource.id, "--debug", "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(afterResource.stdout), downloadedResultJson);
  const rawMode = await execFileAsync(process.execPath, [fixture, "sync", "--debug", "raw", resource.id, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(rawMode.stdout), downloadedResultJson);
  const rawModeEquals = await execFileAsync(process.execPath, [fixture, "sync", "--debug=raw", resource.id, "--output", "json"], { env: { ...process.env, NO_COLOR: "1" } });
  assert.deepEqual(JSON.parse(rawModeEquals.stdout), downloadedResultJson);
});

test("runWireCli restores process argv when root construction fails", async () => {
  const original = process.argv;
  await assert.rejects(() => runWireCli(() => { throw new Error("broken root"); }, ["node", "wire", "--debug"], "/workspace"), /broken root/);
  assert.equal(process.argv, original);
});

test("executable uses only the provided process environment", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-env");
  const project = resolve(root, "project");
  const nested = resolve(project, "documents");
  await rm(root, { recursive: true, force: true });
  await mkdir(nested, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  assert.throws(() => createExecutableRoot({}, nested), /Missing required environment variable: HOME/);
  assert.equal(createExecutableRoot({ HOME: "/home" }, nested).name, "");
});

test("executable discovers repository cookies from op_secrets without an environment variable", async (t) => {
  const root = resolve(import.meta.dirname, "../../../../out/wire-ts-repo-cookie-discovery");
  const home = join(root, "home");
  const project = join(root, "project");
  const nested = join(project, "documents");
  const cookieFile = join(project, "google-docs_cookies.txt");
  await rm(root, { recursive: true, force: true });
  await mkdir(nested, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(project, "op_secrets.py"), "", "utf8");
  await writeFile(cookieFile, ".google.com\tTRUE\t/\tTRUE\t0\tSID\trepo\n", "utf8");
  t.after(async () => rm(root, { recursive: true, force: true }));
  const executable = createExecutableRoot({ HOME: home }, nested);
  const groups = new Map(executable.children.map((command) => [command.name, command]));
  const googleDocs = new Map(groups.get("google-docs").children.map((command) => [command.name, command]));
  await googleDocs.get("logout").handler(context({}));
  await assert.rejects(() => access(cookieFile));
});

test("every Wire and auth command invokes its structured operation", async () => {
  for (const service of ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"]) assert.deepEqual(await serviceCommand(service, "status").handler(context({})), { service, identity: { service } });
  const pasteRoot = createRoot(createFakeWire(), "/workspace", auth, async () => "Cookie: a=b");
  const pasteCommands = new Map(pasteRoot.children.map((command) => [command.name, command]));
  const pasteServiceCommand = (service, command) => new Map(pasteCommands.get(service).children.map((child) => [child.name, child])).get(command);
  assert.deepEqual(await serviceCommand("asana", "login").handler(context({})), { service: "asana", identity: { gid: "1" } });
  assert.deepEqual(await pasteServiceCommand("asana", "login").handler(context({ paste: true })), { service: "asana", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("asana", "logout").handler(context({})), { service: "asana", deleted: true });
  assert.deepEqual(await serviceCommand("chatgpt", "login").handler(context({})), { service: "chatgpt", identity: { account_id: "A1" } });
  assert.deepEqual(await pasteServiceCommand("chatgpt", "login").handler(context({ paste: true })), { service: "chatgpt", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("chatgpt", "logout").handler(context({})), { service: "chatgpt", deleted: true });
  assert.deepEqual(await serviceCommand("gmail", "login").handler(context({})), { service: "gmail", identity: { email: "person@example.com" } });
  assert.deepEqual(await pasteServiceCommand("gmail", "login").handler(context({ paste: true })), { service: "gmail", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("gmail", "logout").handler(context({})), { service: "gmail", deleted: true });
  assert.deepEqual(await serviceCommand("google-docs", "login").handler(context({})), { service: "google-docs", identity: { email: "person@example.com" } });
  assert.deepEqual(await pasteServiceCommand("google-docs", "login").handler(context({ paste: true })), { service: "google-docs", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("google-docs", "logout").handler(context({})), { service: "google-docs", deleted: true });
  assert.deepEqual(await serviceCommand("notion", "login").handler(context({})), authResult);
  assert.deepEqual(await pasteServiceCommand("notion", "login").handler(context({ paste: true })), { service: "notion", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("notion", "logout").handler(context({})), { service: "notion", deleted: true });
  assert.deepEqual(await serviceCommand("slack", "login").handler(context({})), { service: "slack", identity: { user_id: "U1" } });
  assert.deepEqual(await pasteServiceCommand("slack", "login").handler(context({ paste: true })), { service: "slack", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("slack", "logout").handler(context({})), { service: "slack", deleted: true });
  assert.deepEqual(await serviceCommand("zoom", "login").handler(context({})), { service: "zoom", identity: { account_id: "A1" } });
  assert.deepEqual(await pasteServiceCommand("zoom", "login").handler(context({ paste: true })), { service: "zoom", identity: { contents: "Cookie: a=b" } });
  assert.deepEqual(await serviceCommand("zoom", "logout").handler(context({})), { service: "zoom", deleted: true });
  assert.deepEqual(await root.default.handler(context({ url: resource.urls[0] })), result);
  assert.deepEqual(await commands.get("init").handler(context({ backend: "sqlite" })), { root: "/workspace/.wire", backend: "sqlite", path: "registry.sqlite3", created: true });
  assert.deepEqual(await commands.get("init").handler(context({ backend: "files" })), { root: "/workspace/.wire", backend: "files", path: "records", created: true });
  assert.deepEqual(await commands.get("preview").handler(context({ url: resource.urls[0] })), { title: "Document", markdown: "# Document\n", data: { page_id: "page-1" } });
  assert.deepEqual(await commands.get("switch-db").handler(context({})), { root: "/workspace/.wire", from: "sqlite", to: "files", fromPath: "/workspace/.wire/registry.sqlite3", toPath: "/workspace/.wire/records", resources: 1 });
  assert.deepEqual(await commands.get("sync").handler(context({ resource: resource.id })), downloadedResult);
  assert.deepEqual(await commands.get("download").handler(context({ url: resource.urls[0] })), downloadedResult);
  assert.deepEqual(await commands.get("detach").handler(context({ resource: resource.id })), detachedResult);
  assert.deepEqual(await commands.get("watch").handler(context({ file: result.path })).then(({ closed: _closed, close: _close, ...value }) => value), { resource, path: result.path, mode: "two-way", debounceMs: 1000, pollMs: 60000 });
  assert.deepEqual(await commands.get("open").handler(context({ resource: resource.id })), resource);
  assert.deepEqual(await commands.get("sync-all").handler(context({})), [downloadedResult]);
});

test("workspace commands use the launch directory for upward registry discovery", async () => {
  const paths = [];
  const wire = Object.freeze({ ...createFakeWire(), sync: async (_value, path) => { paths.push(path); return result; }, downloadSource: async (_value, path) => { paths.push(path); return result; }, detach: async (_value, path) => { paths.push(path); return detachedResult; }, syncAll: async (path) => { paths.push(path); return [result]; } });
  const nestedRoot = createRoot(wire, "/workspace/docs/nested", auth);
  const nestedCommands = new Map(nestedRoot.children.map((command) => [command.name, command]));
  await nestedCommands.get("sync").handler(context({ resource: resource.id }));
  await nestedCommands.get("download").handler(context({ url: resource.urls[0] }));
  await nestedCommands.get("detach").handler(context({ resource: resource.id }));
  await nestedCommands.get("sync-all").handler(context({}));
  assert.deepEqual(paths, ["/workspace/docs/nested", "/workspace/docs/nested", "/workspace/docs/nested", "/workspace/docs/nested"]);
});

test("MCP exposes only Wire tools", async () => {
  const server = createWireMcpServer(root);
  await server.handleMessage("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  const listed = await server.handleMessage("tools/list");
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "attach", "init", "preview", "sync", "download", "detach", "open", "sync_all",
    "asana__status", "asana__login", "asana__logout", "chatgpt__status", "chatgpt__login", "chatgpt__logout", "gmail__status", "gmail__login", "gmail__logout", "google_docs__status", "google_docs__login", "google_docs__logout", "notion__status", "notion__login", "notion__logout", "slack__status", "slack__login", "slack__logout", "zoom__status", "zoom__login", "zoom__logout",
  ]);
  const called = await server.handleMessage("tools/call", { name: "notion__status", arguments: {} });
  assert.deepEqual(JSON.parse(called.result.content[0].text), { service: "notion", identity: { service: "notion" } });
  const dedicated = await server.handleMessage("tools/call", { name: "slack__status", arguments: {} });
  assert.deepEqual(JSON.parse(dedicated.result.content[0].text), { service: "slack", identity: { service: "slack" } });
});

test("MCP launcher serves native toolcraft over stdio", async () => {
  const child = spawn(process.execPath, [resolve(import.meta.dirname, "../bin/wire-mcp.mjs")], {
    env: { ...process.env, HOME: resolve(import.meta.dirname, "../../../.."), WIRE_REPOSITORY_ROOT: resolve(import.meta.dirname, "../../../.."), WIRE_CHROME_EXECUTABLE: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  child.stdin.end();
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.equal(exitCode, 0);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].result.serverInfo.name, "wire");
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "asana__status"));
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "zoom__login"));
  assert.equal(responses[1].result.tools.some((tool) => tool.name.startsWith("approvals")), false);
});
