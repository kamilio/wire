import { createMCPServer, runMCP } from "toolcraft/mcp";
export function createWireMcpServer(root) {
    return createMCPServer(root, { name: "wire", version: "0.1.0", omitRootToolNamePrefix: true, approvals: false });
}
export function runWireMcp(root) {
    return runMCP(root, { name: "wire", version: "0.1.0", omitRootToolNamePrefix: true, approvals: false });
}
//# sourceMappingURL=mcp.js.map