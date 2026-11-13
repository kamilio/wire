import type { RuntimeCapabilities } from "wire-core";
export declare function nativeDocsGrant(runtime: RuntimeCapabilities, readOnly?: boolean): Promise<{
    token: string;
    driveExport: boolean;
    canWrite: boolean;
} | null>;
export declare function nativeDocMarkdownEqual(left: string, right: string): boolean;
export declare function tryUploadDocBlocks(runtime: RuntimeCapabilities, documentId: string, key: string | null, tabId: string | null, remoteMarkdown: string, desiredMarkdown: string, confirmRemote: (revision: string) => Promise<string>, wroteRevision?: (revision: string) => void, positionRevision?: string): Promise<boolean>;
//# sourceMappingURL=native-docs.d.ts.map