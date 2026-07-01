import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { buildExtension } from "../build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const outRoot = join(repoRoot, "out", "wire-vscode-extension-test");

test("package contributes file, directory, auth, and reload commands", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.equal(packageJson.displayName, "Wire - Markdown Sync");
  assert.match(packageJson.description, /Notion, Google Docs, Slack, Gmail, Asana, ChatGPT, and Zoom/);
  assert.deepEqual(packageJson.categories, ["Productivity", "Other"]);
  for (const keyword of ["markdown", "sync", "notion", "google docs", "slack", "chatgpt", "agents"]) assert.equal(packageJson.keywords.includes(keyword), true);
  assert.equal(packageJson.repository.url, "https://github.com/kamilio/wire.git");
  assert.equal(packageJson.qna, false);
  assert.equal(packageJson.contributes.configuration, undefined);
  assert.match(readme, /Attach Notion, Google Docs, Slack, Gmail, Asana, ChatGPT, and Zoom/);
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.deepEqual(commands, [
    "wire.initProject",
    "wire.attachHere",
    "wire.downloadHere",
    "wire.previewUrl",
    "wire.syncFile",
    "wire.detachFile",
    "wire.openResource",
    "wire.syncDirectory",
    "wire.authStatus",
    "wire.authLogin",
    "wire.authLogout",
    "wire.compileAndReload"
  ]);
  assert.deepEqual(packageJson.contributes.commands.map((command) => command.title), [
    "Wire - Init Project",
    "Wire - Attach",
    "Wire - Download",
    "Wire - Preview",
    "Wire - Sync",
    "Wire - Detach",
    "Wire - Open",
    "Wire - Sync All",
    "Wire - Auth Status",
    "Wire - Login",
    "Wire - Logout",
    "Wire - Compile and Reload"
  ]);
  assert.equal(packageJson.contributes.commands.every((command) => command.category === "Wire"), true);
  assert.equal(packageJson.contributes.submenus, undefined);
  assert.equal(packageJson.scripts.compile, "npm run build");
  assert.equal(packageJson.scripts.watch, "node build.mjs --watch");
});

test("build bundles Wire SDK code without Wire CLI entrypoints", async () => {
  await buildExtension();
  const bundle = await readFile(join(root, "out", "extension.js"), "utf8");
  assert.match(bundle, /composeWire/);
  assert.match(bundle, /wire\.initProject/);
  assert.match(bundle, /defaultWireBackend/);
  assert.match(bundle, /Login required/);
  assert.match(bundle, /wire zoom login/);
  assert.match(bundle, /Wire - Not attached/);
  assert.match(bundle, /Copy URL/);
  assert.match(bundle, /Open URL/);
  assert.doesNotMatch(bundle, /requires files backend/);
  assert.doesNotMatch(bundle, /src\/workspace/);
  assert.doesNotMatch(bundle, /src\/file-registry/);
  assert.doesNotMatch(bundle, /runWireCli|wire\\.mjs|wire-mcp/);
});

test("workspace adapter attaches, downloads, syncs, and detaches through shared sqlite and files registries", async () => {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const entry = join(outRoot, "harness.ts");
  await writeFile(entry, `
    import assert from "node:assert/strict";
    import { existsSync, statSync } from "node:fs";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { dirname, join } from "node:path";
    import { composeWire, configuredWireRoot, defaultWireBackend, defaultWireRegistryPath, defineService, defineServiceCatalog, initializeWire, loadWireConfig, openWireRegistry, registryPathForBackend, wireRelativePath } from "${root}/src/wire-core-node.ts";

    assert.equal(defaultWireBackend, "files");
    assert.equal(defaultWireRegistryPath, "records");

    for (const backend of ["sqlite", "files"] as const) {
      const registryPath = registryPathForBackend(backend);
      const project = join("${outRoot}", backend);
      await mkdir(project, { recursive: true });
      await initializeWire(project, backend, registryPath);
      assert.equal((await loadWireConfig(join(project, ".wire"))).backend, backend);
      let revision = 0;
      const catalog = defineServiceCatalog([defineService({
        name: "notion",
        matches: (url) => url.hostname === "notion.test",
        parse: (url) => ({ service: "notion", identifier: url.pathname.slice(1), type: "document" }),
        fetch: async () => {
          revision += 1;
          return { title: "Attached Page", markdown: \`# Revision \${revision}\\n\`, data: { revision } };
        }
      })]);
      const wire = composeWire({
        home: project,
        fetchInput: {},
        catalog,
        filesystem: {
          exists: async (path: string) => existsSync(path),
          isFile: async (path: string) => existsSync(path) && statSync(path).isFile(),
          readText: (path: string) => readFile(path, "utf8"),
          writeText: async (path: string, contents: string) => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, contents, "utf8");
          }
        },
        workspace: { configuredRoot: configuredWireRoot, initialize: initializeWire, loadConfig: loadWireConfig, openRegistry: openWireRegistry, relativePath: wireRelativePath },
        initialization: { backend, registryPath },
        now: () => new Date("2026-06-17T12:00:00.000Z"),
        open: async () => {}
      });
      const created = await wire.attach("https://notion.test/page", project);
      assert.equal(created.resource.id, "notion:page");
      assert.equal(created.path, join(project, "attached-page.md"));
      assert.equal(await readFile(created.path, "utf8"), "# Revision 1\\n");
      const synced = await wire.sync(created.path, project);
      assert.equal(synced.summary.action, "downloaded");
      assert.equal(await readFile(created.path, "utf8"), "# Revision 2\\n");
      const downloaded = await wire.downloadSource("https://notion.test/downloaded", project);
      assert.equal(downloaded.path, join(project, "attached-page-notion-downloaded.md"));
      assert.equal(downloaded.summary.action, "downloaded");
      assert.deepEqual((await wire.listResources(project)).map((resource) => resource.id), ["notion:page"]);
      const detached = await wire.detach(created.path, project);
      assert.equal(detached.summary.action, "detached");
      assert.deepEqual(await wire.listResources(project), []);
    }
  `);
  const bundle = join(outRoot, "harness.mjs");
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: bundle });
  await import(`file://${bundle}`);
  await rm(outRoot, { recursive: true, force: true });
});
