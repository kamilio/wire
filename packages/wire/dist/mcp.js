import { readFileSync } from "node:fs";
import { createMCPServer, runMCP } from "toolcraft/mcp";
export function createWireMcpServer(root) {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return createMCPServer(root, { name: "wire", version: packageJson.version, omitRootToolNamePrefix: true, approvals: false });
}
export function runWireMcp(root) {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return runMCP(root, { name: "wire", version: packageJson.version, omitRootToolNamePrefix: true, approvals: false });
}
//# sourceMappingURL=mcp.js.map