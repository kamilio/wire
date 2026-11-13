import type { RuntimeCapabilities } from "wire-core";
export declare function nativeDocsGrant(runtime: RuntimeCapabilities, readOnly?: boolean): Promise<{
    token: string;
    driveExport: boolean;
    canWrite: boolean;
} | null>;
export declare function nativeDocMarkdownEqual(left: string, right: string): boolean;
export declare function alreadyAppliedPlainLabelMove(base: string, local: string, remote: string): boolean;
export declare class StaleDocRevision extends Error {
}
export declare function tryUploadDocBlocks(runtime: RuntimeCapabilities, documentId: string, key: string | null, tabId: string | null, remoteMarkdown: string, desiredMarkdown: string, confirmRemote: (revision: string) => Promise<string>, onWrite?: (revision: string | undefined) => void, positionRevision?: string): Promise<boolean>;
//# sourceMappingURL=native-docs.d.ts.map