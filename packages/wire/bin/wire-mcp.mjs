#!/usr/bin/env node
const { createExecutableRoot } = await import("../dist/executable.js");
const { runWireMcp } = await import("../dist/mcp.js");

const root = createExecutableRoot(process.env, process.cwd());
await runWireMcp(root);
