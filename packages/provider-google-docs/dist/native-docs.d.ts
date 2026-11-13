import type { RuntimeCapabilities } from "wire-core";
export declare function nativeDocsToken(runtime: RuntimeCapabilities, readOnly?: boolean): Promise<string | null>;
export declare function nativeDocMarkdownEqual(left: string, right: string): boolean;
export declare function tryUploadDocBlocks(runtime: RuntimeCapabilities, documentId: string, key: string | null, tabId: string | null, remoteMarkdown: string, desiredMarkdown: string, confirmRemote: () => Promise<string>): Promise<boolean>;
//# sourceMappingURL=native-docs.d.ts.map