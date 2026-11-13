export { notionService } from "./notion.js";
export { buildNotionCreateOperations, diffNotionBlockTrees, fetchNotionDocument, notionBlockContentHash, parseNotionMarkdown, renderNotionTreeToMarkdown, sidecarBlocksFromNotionTree, synchronizeNotionDocument } from "./notion-sync.js";
export type { NotionBlock, NotionDiffSummary, NotionOperation, NotionRichText, NotionSidecarBlock, NotionTree } from "./notion-sync.js";
export declare const notionProvider: Readonly<{
    services: readonly [Readonly<{
        name: string;
        owner?: string;
        matches(url: URL): boolean;
        parse(url: URL): import("wire-core").Source;
        fetch(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>): Promise<Readonly<{
            title: string;
            markdown: string;
            data: import("wire-core").JsonValue;
        }>>;
        download?(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>, write: import("wire-core").DownloadWriter, addMarkdown?: import("wire-core").AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
        mergeDrafts?(base: string, editor: string, shell: string): string;
        synchronize?(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
            title: string;
            markdown: string;
            data: import("wire-core").JsonValue;
        }>) => void | Promise<void>, requireConditionalWrite?: boolean): Promise<import("wire-core").SynchronizedDocument>;
        upload?(input: import("wire-core").RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
    }>];
}>;
export { lookupNotionUsers } from "./notion-sync.js";
//# sourceMappingURL=index.d.ts.map