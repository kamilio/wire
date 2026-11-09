import type { RuntimeCapabilities } from "wire-core";
export declare function latticeReviewDraft(runtime: RuntimeCapabilities, input: string, markdown?: string): Promise<string>;
export declare function listLatticeReviewRequests(runtime: RuntimeCapabilities, input: string): Promise<string>;
export declare function syncLatticeDrafts(runtime: RuntimeCapabilities, input: string | undefined, directory: string, file?: string): Promise<string>;
//# sourceMappingURL=draft.d.ts.map