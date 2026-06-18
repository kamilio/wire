import type { WireRoot } from "./adapters/root.js";
export declare function createWireMcpServer(root: WireRoot): Omit<import("tiny-stdio-mcp-server").Server, "connect"> & {
    connect(transport: import("tiny-stdio-mcp-server").SDKTransport): Promise<void>;
};
export declare function runWireMcp(root: WireRoot): Promise<void>;
//# sourceMappingURL=mcp.d.ts.map