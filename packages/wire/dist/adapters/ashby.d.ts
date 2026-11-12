import type { Cookie, RuntimeCapabilities } from "wire-core";
export declare function ashbySession(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<(query: string, variables?: Record<string, unknown>) => Promise<any>>;
export declare function ashby(runtime: RuntimeCapabilities, action: string, arg?: string): Promise<string>;
//# sourceMappingURL=ashby.d.ts.map