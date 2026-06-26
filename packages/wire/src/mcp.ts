import { readFileSync } from "node:fs";

import { createMCPServer, runMCP } from "toolcraft/mcp";

import type { WireRoot } from "./adapters/root.js";

export function createWireMcpServer(root: WireRoot) {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return createMCPServer(root, { name: "wire", version: packageJson.version, omitRootToolNamePrefix: true, approvals: false });
}

export function runWireMcp(root: WireRoot): Promise<void> {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return runMCP(root, { name: "wire", version: packageJson.version, omitRootToolNamePrefix: true, approvals: false });
}
