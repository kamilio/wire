import type { FetchedDocument, JsonObject, JsonValue, Source, UploadedDocument } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
export type NotionRichText = JsonValue[][];
export type NotionBlock = Readonly<{
    type: string;
    content: string;
    properties: JsonObject;
    rich_text: NotionRichText;
    indent: number;
}>;
export type NotionTree = Readonly<{
    id: string;
    block: JsonObject;
    children: readonly NotionTree[];
}>;
export type NotionOperation = Readonly<{
    pointer: JsonObject;
    path: readonly JsonValue[];
    command: string;
    args: JsonValue;
}>;
export type NotionSidecarBlock = Readonly<{
    id: string;
    path: readonly number[];
    type: string;
    hash: string;
    snapshot: JsonObject;
}>;
export type NotionDiffSummary = Readonly<{
    inserted: number;
    updated: number;
    deleted: number;
    moved: number;
}>;
type UserMentions = Readonly<Record<string, string>>;
export declare function parseNotionMarkdown(markdown: string): readonly NotionBlock[];
export declare function buildNotionCreateOperations(blocks: readonly NotionBlock[], pageId: string, spaceId: string, userId: string, currentTime: number, createId?: () => string, initialTableColumnOrder?: readonly string[]): Readonly<{
    operations: readonly NotionOperation[];
    topLevelIds: readonly string[];
}>;
export declare function notionBlockContentHash(block: NotionBlock | JsonObject, columnOrder?: readonly string[]): string;
export declare function sidecarBlocksFromNotionTree(tree: NotionTree): readonly NotionSidecarBlock[];
export declare function diffNotionBlockTrees(remoteTree: NotionTree, localBlocks: readonly NotionBlock[], _sidecarBlocks: readonly NotionSidecarBlock[], ambient: Readonly<{
    spaceId: string;
    userId: string;
    currentTime: number;
}>): Readonly<{
    operations: readonly NotionOperation[];
    summary: NotionDiffSummary;
}>;
export declare function renderNotionTreeToMarkdown(tree: NotionTree, mentions?: UserMentions): string;
export declare function fetchNotionDocument(runtime: RuntimeCapabilities, url: string, source: Source): Promise<FetchedDocument>;
export declare function uploadNotionDocument(runtime: RuntimeCapabilities, markdown: string, _markdownPath: string): Promise<UploadedDocument>;
export declare function synchronizeNotionDocument(runtime: RuntimeCapabilities, url: string, source: Source, base: JsonValue, markdown: string, _markdownPath: string): Promise<FetchedDocument>;
export {};
//# sourceMappingURL=notion-sync.d.ts.map