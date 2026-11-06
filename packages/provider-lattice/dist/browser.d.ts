import type { RuntimeCapabilities } from "wire-core";
export type Query = <R>(fields: string, vars?: Record<string, string | null>) => Promise<R>;
export declare function browser<T>(runtime: RuntimeCapabilities, url: URL, work: (query: Query, args: string[]) => Promise<T>): Promise<T>;
//# sourceMappingURL=browser.d.ts.map