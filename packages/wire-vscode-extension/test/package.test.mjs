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
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.deepEqual(commands, [
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
    "Attach URL Here",
    "Download URL Here",
    "Preview URL",
    "Sync File",
    "Detach File",
    "Open Resource",
    "Sync Directory",
    "Auth Status",
    "Login",
    "Logout",
    "Compile and Reload"
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
  assert.doesNotMatch(bundle, /runWireCli|wire\\.mjs|wire-mcp/);
});

test("files workspace adapter attaches, downloads, syncs, and detaches through composeWire", async () => {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const entry = join(outRoot, "harness.ts");
  await writeFile(entry, `
    import assert from "node:assert/strict";
    import { existsSync, statSync } from "node:fs";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { dirname, join } from "node:path";
    import { composeWire, defineService, defineServiceCatalog } from "${root}/src/wire-core-node.ts";
    import { configuredWireRoot, initializeWire, loadWireConfig, openWireRegistry, wireRelativePath } from "${root}/src/workspace.ts";

    const project = "${outRoot}/project";
    await mkdir(project, { recursive: true });
    await initializeWire(project, "files", "records");
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
      initialization: { backend: "files", registryPath: "records" },
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
  `);
  const bundle = join(outRoot, "harness.mjs");
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: bundle });
  await import(`file://${bundle}`);
  await rm(outRoot, { recursive: true, force: true });
});
