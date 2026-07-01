import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { composeWire, configuredWireRoot, defineService, defineServiceCatalog, initializeWire, openWireRegistry, wireRelativePath } from "../dist/index.js";
import { withWireHooks } from "../dist/hooks.js";

const execFileAsync = promisify(execFile);
const testRoot = resolve(import.meta.dirname, "../../../../out/wire-ts-hooks");

before(async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
});

after(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

function filesystem() {
  return {
    exists: async (path) => access(path).then(() => true, () => false),
    isFile: async (path) => access(path).then(() => true, () => false),
    readText: (path) => readFile(path, "utf8"),
    writeText: async (path, contents) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    },
  };
}

function createWire(project, environment = process.env) {
  const wire = composeWire({
    home: project,
    fetchInput: {},
    catalog: defineServiceCatalog([
      defineService({
        name: "notion",
        matches: (url) => url.hostname === "notion.test",
        parse: (url) => ({ service: "notion", identifier: url.pathname.slice(1), type: "document" }),
        fetch: async (_input, _url, source) => ({ title: "First", markdown: "# First\n", data: { id: source.identifier } }),
      }),
    ]),
    filesystem: filesystem(),
    workspace: { configuredRoot: configuredWireRoot, initialize: initializeWire, openRegistry: openWireRegistry, relativePath: wireRelativePath },
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    now: () => new Date("2026-06-23T12:00:00.000Z"),
    open: async () => {},
  });
  return withWireHooks(wire, { currentDirectory: project, home: project, environment });
}

async function writeExecutable(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

test("post-resource hooks move files, update registry, and chain environment", async () => {
  const project = join(testRoot, "move-chain");
  await mkdir(project, { recursive: true });
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeExecutable(join(project, ".wire/hooks/post-resource"), `#!/bin/sh
set -eu
mkdir -p "docs/$WIRE_SERVICE"
dest="docs/$WIRE_SERVICE/$WIRE_TITLE.md"
mv "$WIRE_PATH" "$dest"
echo "WIRE_PATH=$dest"
`);
  await writeExecutable(join(project, ".wire/hooks/post-resource.d/010-check-path"), `#!/bin/sh
set -eu
printf "%s" "$WIRE_PATH" > hook-path.txt
`);
  await writeExecutable(join(project, ".wire/hooks/post-command"), `#!/bin/sh
set -eu
printf "%s\\n%s\\n%s" "$WIRE_EVENT" "$WIRE_RESULT_COUNT" "$WIRE_PATH" > post-command.txt
`);

  const result = await createWire(project).attach("https://notion.test/page", project);
  const registry = await openWireRegistry(project, project);
  const resource = await registry.get(result.resource.id);

  assert.equal(result.path, join(project, "docs/notion/First.md"));
  await assert.rejects(() => access(join(project, "First.md")));
  assert.equal(await readFile(join(project, "docs/notion/First.md"), "utf8"), "# First\n");
  assert.equal(resource.filesystem_links.find((attach) => attach.role === "primary").path, "docs/notion/First.md");
  assert.equal(await readFile(join(project, "hook-path.txt"), "utf8"), join(project, "docs/notion/First.md"));
  assert.equal(await readFile(join(project, "post-command.txt"), "utf8"), `post-command\n1\n${join(project, "docs/notion/First.md")}`);
});

test("wire config env is available to automatically discovered CLI hooks", async () => {
  const project = join(testRoot, "config-env");
  await mkdir(join(project, ".wire"), { recursive: true });
  await writeFile(join(project, ".wire/config.json"), `${JSON.stringify({ backend: "sqlite", path: "registry.sqlite3", env: { WIRE_CUSTOM_VALUE: "from-config" } }, null, 2)}\n`);
  await writeExecutable(join(project, ".wire/hooks/post-command"), `#!/bin/sh
set -eu
printf "%s" "$WIRE_CUSTOM_VALUE" > config-env.txt
`);

  await execFileAsync(process.execPath, [resolve(import.meta.dirname, "../bin/wire.mjs"), "sync-all"], {
    cwd: project,
    env: { ...process.env, HOME: project, NO_COLOR: "1", WIRE_NODE_NO_WARNINGS_REEXEC: "1" },
    timeout: 3000,
  });

  assert.equal(await readFile(join(project, "config-env.txt"), "utf8"), "from-config");
});

test("downloadSource runs post-resource and post-command hooks", async () => {
  const project = join(testRoot, "download-source-hooks");
  await mkdir(project, { recursive: true });
  await initializeWire(project, "sqlite", "registry.sqlite3");
  await writeExecutable(join(project, ".wire/hooks/post-resource"), `#!/bin/sh
set -eu
printf "%s\\n%s\\n%s" "$WIRE_COMMAND" "$WIRE_ACTION" "$WIRE_PATH" > post-resource.txt
`);
  await writeExecutable(join(project, ".wire/hooks/post-command"), `#!/bin/sh
set -eu
printf "%s\\n%s" "$WIRE_COMMAND" "$WIRE_RESULT_COUNT" > post-command.txt
`);

  const result = await createWire(project).downloadSource("https://notion.test/page", project);

  assert.equal(result.summary.action, "downloaded");
  assert.equal(await readFile(join(project, "post-resource.txt"), "utf8"), `download\ndownloaded\n${join(project, "first.md")}`);
  assert.equal(await readFile(join(project, "post-command.txt"), "utf8"), "download\n1");
});
