import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const workspaceRoot = join(repositoryRoot, "wire_ts");
const packageRoot = resolve(import.meta.dirname, "..");
const testRoot = join(repositoryRoot, "out", "wire-ts-architecture");
const distRoot = join(packageRoot, "dist");
const entryPoint = join(distRoot, "index.js");
const runtimeDependencies = {
  commander: "^14.0.3",
  "fast-string-width": "^3.0.2",
  "fast-wrap-ansi": "^0.2.0",
  ignore: "^5.3.2",
  jose: "^6.1.2",
  "jsonc-parser": "^3.3.1",
  "provider-asana": "0.1.0",
  "provider-chatgpt": "0.1.0",
  "provider-gmail": "0.1.0",
  "provider-google-docs": "0.1.0",
  "provider-notion": "0.1.0",
  "provider-slack": "0.1.0",
  "provider-zoom": "0.1.0",
  sisteransi: "^1.0.5",
  "smol-toml": "^1.3.0",
  "tiny-stdio-mcp-server": "^0.1.0",
  toolcraft: "^0.0.56",
  "toolcraft-schema": "0.0.56",
  "wire-core": "0.1.0",
  yaml: "^2.8.2",
};

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(path, entry.name);
    return entry.isDirectory() ? files(entryPath) : [entryPath];
  }));
  return nested.flat();
}

function imports(contents) {
  return [...contents.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map((match) => match[1]);
}

async function mcpTools(executable, cwd, environment) {
  const child = spawn(executable, [], { cwd, env: environment, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  child.stdin.end();
  const exitCode = await new Promise((resolveExit) => child.on("close", resolveExit));
  assert.equal(exitCode, 0);
  return stdout.trim().split("\n").map((line) => JSON.parse(line))[1].result.tools.map((tool) => tool.name);
}

test("public entry point imports without runtime capabilities", async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
  const script = `
    process.exit = () => { throw new Error("process.exit called during import") };
    globalThis.fetch = async () => { throw new Error("fetch called during import") };
    const imported = await import(${JSON.stringify(entryPoint)});
    process.stdout.write(JSON.stringify(Object.keys(imported).sort()));
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--permission", `--allow-fs-read=${workspaceRoot}`, "--eval", script], {
    cwd: testRoot,
    env: {},
  });
  assert.deepEqual(JSON.parse(stdout), [
    "FileRegistry",
    "SqliteRegistry",
    "asanaChanges",
    "asanaConflicts",
    "asanaDocument",
    "asanaProjectService",
    "asanaProvider",
    "asanaSnapshot",
    "asanaTaskService",
    "buildNotionCreateOperations",
    "chatgptProvider",
    "chatgptService",
    "composeAuth",
    "composeNodeRuntime",
    "composeWire",
    "configuredWireRoot",
    "cookiesFile",
    "createCookiesCapability",
    "createExecutableRoot",
    "createGoogleTokensCapability",
    "createNodeClock",
    "createNodeConfiguration",
    "createNodeFilesystem",
    "createNodeHttp",
    "createNodeOpenFiles",
    "createNodeProcess",
    "createNodeRuntime",
    "createNodeSecrets",
    "createNodeWatch",
    "createRoot",
    "createServiceRegistry",
    "createWireMcpServer",
    "defineService",
    "defineServiceCatalog",
    "detectCookieFormat",
    "diffNotionBlockTrees",
    "discoverWireRoot",
    "extractChromeCookies",
    "extractRelationships",
    "fetchNotionDocument",
    "fetchSource",
    "formatAsanaTask",
    "gmailMessageBody",
    "gmailProvider",
    "gmailService",
    "googleDocsProvider",
    "googleDocsService",
    "googleTokenExpired",
    "initializeWire",
    "loadWireConfig",
    "markdownFilename",
    "mergeGoogleRefresh",
    "normalizeResource",
    "notionBlockContentHash",
    "notionProvider",
    "notionService",
    "openWireRegistry",
    "parseAsanaMarkdown",
    "parseCookieHeader",
    "parseGoogleCredentials",
    "parseGoogleToken",
    "parseJsonCookies",
    "parseNetscapeCookies",
    "parseNotionMarkdown",
    "parsePastedCookieMetadata",
    "parsePastedCookies",
    "parseSourceUrl",
    "renderAsanaMarkdown",
    "renderNotionTreeToMarkdown",
    "repositoryCookiesFile",
    "resourceId",
    "runWireCli",
    "runWireMcp",
    "serializeNetscapeCookies",
    "serviceCatalog",
    "sidecarBlocksFromNotionTree",
    "slackProvider",
    "slackService",
    "slackText",
    "slackTitle",
    "stableJsonCompact",
    "stableJsonPretty",
    "switchWireBackend",
    "synchronizeNotionDocument",
    "synchronizeSource",
    "uploadSource",
    "wirePresentation",
    "wireRelativePath",
    "zoomHubService",
    "zoomProvider",
  ]);
  assert.deepEqual(await readdir(testRoot), []);
  await rm(testRoot, { recursive: true, force: true });
});

test("production package boundary contains only the intended runtime", async () => {
  const packageDocument = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(packageDocument.dependencies, runtimeDependencies);
  assert.deepEqual(packageDocument.bundledDependencies.toSorted(), Object.keys(runtimeDependencies).toSorted());
  const productionFiles = [
    ...(await files(join(packageRoot, "src"))),
    ...(await files(join(packageRoot, "bin"))),
  ];
  const forbiddenScriptReference = new RegExp([["p", "ython3"].join(""), "\\." + "py(?:[\"'`/]|$)"].join("|"), "i");
  for (const path of productionFiles) {
    const contents = await readFile(path, "utf8");
    assert.doesNotMatch(contents, /todos_mcp_cli/);
    assert.doesNotMatch(contents, forbiddenScriptReference);
    assert.doesNotMatch(contents, /(?:^|["'`/])fixtures(?:["'`/]|$)/m);
    assert.doesNotMatch(contents, /^import\s+(?!type\b).*["']node:sqlite["']/m);
    if (path.includes(`${sep}src${sep}`)) assert.doesNotMatch(contents, /process\.cwd\s*\(/);
  }
});

test("executable runtime does not wire Chrome-backed browser capabilities", async () => {
  const executableSource = await readFile(join(packageRoot, "src", "executable.ts"), "utf8");
  const nodeRuntimeSource = await readFile(join(workspaceRoot, "packages", "wire-core", "src", "runtime", "node.ts"), "utf8");
  const portsSource = await readFile(join(workspaceRoot, "packages", "wire-core", "src", "ports.ts"), "utf8");
  assert.doesNotMatch(executableSource, /createChromeBrowserCapability/);
  assert.doesNotMatch(executableSource, /createChromeChatgptCapability/);
  assert.doesNotMatch(nodeRuntimeSource, /createChromeBrowserCapability/);
  assert.doesNotMatch(nodeRuntimeSource, /createChromeChatgptCapability/);
  assert.doesNotMatch(portsSource, /BrowserCapability|BrowserResponse/);
  assert.doesNotMatch(executableSource, /googleDocsTokens|GOOGLE_DOCS_TOKEN_FILE/);
  assert.doesNotMatch(nodeRuntimeSource, /googleDocsTokens|GOOGLE_DOCS_TOKEN_FILE/);
  assert.doesNotMatch(portsSource, /googleDocsTokens/);
});

test("source dependencies point from core through ports, adapters, and composition", async () => {
  const sourceRoot = join(packageRoot, "src");
  const sourceFiles = (await files(sourceRoot)).filter((path) => path.endsWith(".ts"));
  assert.equal(sourceFiles.some((path) => ["core/index.ts", "runtime/index.ts", "storage/index.ts"].includes(path.slice(sourceRoot.length + 1))), false);
  for (const path of sourceFiles) {
    const relativePath = path.slice(sourceRoot.length + 1);
    const dependencies = imports(await readFile(path, "utf8"));
    if (relativePath.startsWith("core/")) assert.equal(dependencies.some((dependency) => dependency.includes("ports") || dependency.includes("adapters") || dependency.includes("runtime") || dependency.includes("storage")), false);
    if (relativePath === "ports.ts") assert.equal(dependencies.some((dependency) => dependency.includes("adapters") || dependency.includes("runtime") || dependency.includes("storage")), false);
    if (relativePath.startsWith("adapters/services/")) assert.equal(dependencies.some((dependency) => dependency.includes("runtime/") || dependency.includes("storage/") || dependency.includes("operations")), false);
  }
});

test("packed package installs and runs outside the repository", async (context) => {
  const packRoot = join(testRoot, "pack");
  const consumerRoot = join(testRoot, "consumer");
  const npmPackCache = join(testRoot, "npm-pack-cache");
  const npmInstallCache = join(testRoot, "npm-install-cache");
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(packRoot, { recursive: true });
  await mkdir(consumerRoot, { recursive: true });
  context.after(() => rm(testRoot, { recursive: true, force: true }));
  const npmPackEnvironment = { ...process.env, npm_config_cache: npmPackCache };
  const npmInstallEnvironment = { ...process.env, npm_config_cache: npmInstallCache };
  const packed = JSON.parse((await execFileAsync("npm", ["pack", "--json", "--pack-destination", packRoot], { cwd: packageRoot, env: npmPackEnvironment })).stdout)[0];
  const packedPaths = packed.files.map((file) => file.path).sort();
  for (const path of [
    "bin/wire-mcp.mjs",
    "bin/wire.mjs",
    "package.json",
    "node_modules/provider-asana/dist/index.js",
    "node_modules/provider-chatgpt/dist/index.js",
    "node_modules/provider-gmail/dist/index.js",
    "node_modules/provider-google-docs/dist/index.js",
    "node_modules/provider-notion/dist/index.js",
    "node_modules/provider-slack/dist/index.js",
    "node_modules/provider-zoom/dist/index.js",
    "node_modules/wire-core/dist/index.js",
    "node_modules/toolcraft/dist/cli.js",
    "node_modules/toolcraft-schema/dist/index.js",
  ]) assert.ok(packedPaths.includes(path), path);
  assert.equal(packedPaths.some((path) => path.startsWith("node_modules/typescript/")), false);
  assert.deepEqual(packed.bundled.toSorted(), Object.keys(runtimeDependencies).toSorted());
  assert.deepEqual(packedPaths.filter((path) => path.startsWith("dist/")).sort(), [
    ...(await files(distRoot)).map((path) => path.slice(distRoot.length + 1)).flatMap((path) => [`dist/${path}`]),
  ].sort());
  assert.deepEqual(packedPaths.filter((path) => path.startsWith("src/")).sort(), [
    ...(await files(join(packageRoot, "src"))).map((path) => path.slice(packageRoot.length + 1)),
  ].sort());
  const tarball = join(packRoot, packed.filename);
  await execFileAsync("npm", ["init", "--yes"], { cwd: consumerRoot, env: npmInstallEnvironment });
  const consumerPackage = JSON.parse(await readFile(join(consumerRoot, "package.json"), "utf8"));
  await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify({ ...consumerPackage, type: "module" }, null, 2)}\n`);
  await execFileAsync("npm", ["install", "--offline", tarball], { cwd: consumerRoot, env: npmInstallEnvironment });
  const installedRoot = join(consumerRoot, "node_modules", "wire");
  const rootDeclaration = await readFile(join(installedRoot, "dist", "adapters", "root.d.ts"), "utf8");
  assert.doesNotMatch(rootDeclaration, /toolcraft-schema/);
  assert.equal(rootDeclaration.length < 1500, true);
  for (const path of await files(join(installedRoot, "dist"))) {
    if (!path.endsWith(".js") && !path.endsWith(".d.ts")) continue;
    const document = await readFile(path, "utf8");
    const mapPath = `${path}.map`;
    const sourceMap = JSON.parse(await readFile(mapPath, "utf8"));
    assert.equal(sourceMap.version, 3);
    assert.equal(sourceMap.file, basename(path));
    assert.equal(sourceMap.sources.length, 1);
    assert.equal(resolve(dirname(mapPath), sourceMap.sources[0]), join(installedRoot, "src", path.slice(join(installedRoot, "dist").length + 1).replace(/\.d\.ts$|\.js$/, ".ts")));
    assert.match(document, new RegExp(`sourceMappingURL=${basename(mapPath).replaceAll(".", "\\.")}$`));
  }
  const importScript = `
    const library = await import("wire");
    const cli = await import("wire/cli");
    const mcp = await import("wire/mcp");
    process.stdout.write(JSON.stringify({
      library: typeof library.composeWire,
      cli: typeof cli.runWireCli,
      mcp: typeof mcp.runWireMcp,
    }));
  `;
  const imported = await execFileAsync(process.execPath, ["--eval", importScript], { cwd: consumerRoot, env: {} });
  assert.deepEqual(JSON.parse(imported.stdout), { library: "function", cli: "function", mcp: "function" });
  await writeFile(join(consumerRoot, "consumer.ts"), `
    import { composeWire, createExecutableRoot, createRoot, defineService, defineServiceCatalog, type NodeEnvironment, type Registry, type Resource, type Wire, type WireRoot } from "wire";
    import { runWireCli } from "wire/cli";
    import { createWireMcpServer } from "wire/mcp";

    const resources = new Map<string, Resource>();
    const registry: Registry = {
      async put(resource) { resources.set(resource.id, resource); return resource; },
      async get(resourceId) { return resources.get(resourceId)!; },
      async findByIdentifier(service, identifier) { return [...resources.values()].find((resource) => resource.identifiers.some((item) => item.service === service && item.identifier === identifier))!; },
      async findByUrl(url) { return [...resources.values()].find((resource) => resource.urls.includes(url))!; },
      async findByPath(path) { return [...resources.values()].filter((resource) => resource.filesystem_links.some((link) => link.path === path)); },
      async listResources() { return [...resources.values()]; },
      async delete(resourceId) { resources.delete(resourceId); },
    };
    const runtime = { title: "Consumer document" };
    const service = defineService<typeof runtime>({
      name: "consumer",
      matches: (url) => url.hostname === "consumer.example",
      parse: (url) => ({ service: "consumer", identifier: url.pathname.slice(1), type: "document" }),
      fetch: async (input, _url, source) => ({ title: input.title, markdown: \`# \${source.identifier}\\n\`, data: { runtime: input.title } }),
    });
    const catalog = defineServiceCatalog([service]);
    const writes: Array<[string, string]> = [];
    const wire: Wire = composeWire({
      home: "/home/consumer",
      fetchInput: runtime,
      catalog,
      filesystem: {
        exists: async () => false,
        isFile: async () => false,
        readText: async () => "# page\\n",
        writeText: async (path, contents) => { writes.push([path, contents]); },
      },
      workspace: {
        configuredRoot: async () => "/workspace/.wire",
        initialize: async (_path, backend, registryPath) => ({ root: "/workspace/.wire", backend, path: registryPath, created: true }),
        openRegistry: async () => registry,
        relativePath: (path) => path.slice("/workspace/".length),
      },
      initialization: { backend: "files", registryPath: "registry" },
      now: () => new Date("2026-06-10T12:00:00.000Z"),
      open: async () => {},
    });
    const viewed = await wire.view("https://consumer.example/page");
    const created = await wire.create("https://consumer.example/page", "/workspace");
    const root: WireRoot = createRoot(wire, "/workspace");
    const children = [...root.children];
    const server = createWireMcpServer(root);
    const environment: NodeEnvironment = {};
    const executableFactory: (environment: NodeEnvironment, currentDirectory: string) => WireRoot = createExecutableRoot;
    if (process.env["WIRE_CONSUMER_CLI"] === "1") await runWireCli(root, ["node", "wire", "preview", "https://consumer.example/page", "--output", "json"], "/workspace");
    else process.stdout.write(JSON.stringify({ viewed, created, writes, registry: await registry.listResources(), commands: root.children.map((child) => child.name), unchanged: root.children.every((child, index) => child === children[index]), server: typeof server.handleMessage, operations: Object.keys(wire).sort(), executable: typeof executableFactory, environment: Object.keys(environment) }));
  `);
  await writeFile(join(consumerRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist", skipLibCheck: false }, include: ["consumer.ts"] }));
  await execFileAsync(process.execPath, [join(workspaceRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: consumerRoot });
  const consumer = JSON.parse((await execFileAsync(process.execPath, [join(consumerRoot, "dist", "consumer.js")], { cwd: consumerRoot, env: {} })).stdout);
  await context.test("custom registry", () => assert.deepEqual(consumer.registry, [consumer.created.resource]));
  await context.test("custom service catalog", () => assert.equal(consumer.created.resource.identifiers[0].service, "consumer"));
  await context.test("fake runtime", () => assert.deepEqual(consumer.viewed.data, { runtime: "Consumer document" }));
  await context.test("direct operation calls", () => {
    assert.deepEqual(consumer.writes, [["/workspace/consumer-document.md", "# page\n"]]);
    assert.deepEqual(consumer.operations, ["create", "download", "init", "listResources", "openResource", "showResource", "switchBackend", "sync", "syncAll", "unlink", "view", "watch"]);
  });
  await context.test("CLI embedding", async () => {
    const execution = await execFileAsync(process.execPath, [join(consumerRoot, "dist", "consumer.js")], { cwd: consumerRoot, env: { WIRE_CONSUMER_CLI: "1", NO_COLOR: "1" } });
    assert.deepEqual(JSON.parse(execution.stdout), consumer.viewed);
  });
  await context.test("MCP construction", () => {
    assert.equal(consumer.server, "function");
    assert.equal(consumer.unchanged, true);
    assert.deepEqual(consumer.commands, ["link", "init", "preview", "switch-db", "sync", "download", "unlink", "watch", "open", "sync-all"]);
  });
  assert.equal(consumer.executable, "function");
  assert.deepEqual(consumer.environment, []);
  const environment = { ...process.env, HOME: consumerRoot, NO_COLOR: "1" };
  const cli = await execFileAsync(join(consumerRoot, "node_modules", ".bin", "wire"), ["--help"], { cwd: consumerRoot, env: environment });
  for (const name of ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom", "link", "init", "preview", "sync", "download", "unlink", "watch", "open", "sync-all"]) assert.match(cli.stdout, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(cli.stdout, /\bapprovals\b/);
  assert.doesNotMatch(cli.stdout, /^\s+view(?:\s|$)/m);
  assert.match(cli.stdout, /<url>/);
  assert.match(cli.stdout, /Link a source URL as Markdown\./);
  assert.doesNotMatch(cli.stdout, /^\s+create(?:\s|$)/m);
  assert.doesNotMatch(cli.stdout, /^\s+list\s+List registered resources without syncing them\./m);
  assert.doesNotMatch(cli.stdout, /^\s+show <resource>\s+Show registered resource details without opening the source URL\./m);
  assert.doesNotMatch(cli.stdout, /--path/);
  assert.doesNotMatch(cli.stdout, /switch-db/);
  assert.deepEqual(await mcpTools(join(consumerRoot, "node_modules", ".bin", "wire-mcp"), consumerRoot, environment), ["init", "preview", "sync", "download", "unlink", "open", "sync_all", "asana__status", "asana__login", "asana__logout", "chatgpt__status", "chatgpt__login", "chatgpt__logout", "gmail__status", "gmail__login", "gmail__logout", "google_docs__status", "google_docs__login", "google_docs__logout", "notion__status", "notion__login", "notion__logout", "slack__status", "slack__login", "slack__logout", "zoom__status", "zoom__login", "zoom__logout"]);
});
