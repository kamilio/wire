import { createMCPServer, runMCP } from "toolcraft/mcp";

import type { WireRoot } from "./adapters/root.js";

export function createWireMcpServer(root: WireRoot) {
  return createMCPServer(root, { name: "wire", version: "0.1.0", omitRootToolNamePrefix: true, approvals: false });
}

export function runWireMcp(root: WireRoot): Promise<void> {
  return runMCP(root, { name: "wire", version: "0.1.0", omitRootToolNamePrefix: true, approvals: false });
}
