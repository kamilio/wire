#!/usr/bin/env node
const { createExecutableRoot } = await import("../dist/executable.js");
const { runWireCli } = await import("../dist/cli.js");

await runWireCli((currentDirectory) => createExecutableRoot(process.env, currentDirectory), process.argv, process.cwd());
