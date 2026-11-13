import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "../dist/adapters/root.js";
import { editDocument, documentDiff } from "../dist/adapters/document-shell.js";

test("shell reads only the supplied document and does not inherit the host environment", async () => {
  const result = await editDocument("# Note\n", [
    '[ -z "$HOME" ] && [ ! -e /etc/passwd ] && [ ! -e /.wire ] || exit 7',
    'command -v curl && exit 8; command -v node && exit 9',
    'echo scratch > other.md',
    'sed -i "s/Note/Edited/" document.md',
    'cat document.md',
  ].join("\n"));
  assert.deepEqual(result, { edited: "# Edited\n", stdout: "# Edited\n", stderr: "" });
});

test("shell rejects failed scripts, deletion and non-text output", async () => {
  for (const [script, error] of [
    ['echo lost >document.md; exit 42', /Shell exited 42; no changes saved/],
    ['rm document.md', /Keep \/document.md as a regular file/],
    ["printf '\\377' >document.md", /UTF-8 text/],
  ]) await assert.rejects(editDocument("# Original\n", script), error);
  assert.equal((await editDocument("\ufeff# Keep BOM\r\n", "cat document.md")).edited, "\ufeff# Keep BOM\r\n");
});

test("shell checkpoints exactly the edited document and its starting generation without syncing", async () => {
  const calls = [];
  const commands = createRoot({
    historyDiff: async (...args) => { calls.push(args); return { before: "base\n", token: "original" }; },
    checkpoint: async (...args) => { calls.push(args); },
  }, "/workspace").children;
  const shell = commands.find(command => command.name === "shell");
  const run = script => shell.handler({ params: { resource: "My Note.md", script } });
  const read = ["My Note.md", "/workspace", "working", "working"];
  assert.equal((await run("cat document.md")).changed, false);
  assert.equal((await run("echo added >> document.md")).changed, true);
  await assert.rejects(run("echo bad > document.md; false"), /no changes saved/);
  assert.deepEqual(calls, [read, read, ["My Note.md", "/workspace", "base\n", "base\nadded\n", "original"], read]);
});

test("diff shows surrounding lines and preserves labels as data", async () => {
  assert.equal(await documentDiff("local", "remote", "a\nb\nc\n", "a\nB\nc\n"), "--- local\n+++ remote\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n");
  assert.equal(await documentDiff("a", "b", "same", "same"), "");
});
