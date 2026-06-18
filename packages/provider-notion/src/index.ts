import { notionService } from "./notion.js";

export { notionService } from "./notion.js";
export { buildNotionCreateOperations, diffNotionBlockTrees, fetchNotionDocument, notionBlockContentHash, parseNotionMarkdown, renderNotionTreeToMarkdown, sidecarBlocksFromNotionTree, synchronizeNotionDocument } from "./notion-sync.js";
export type { NotionBlock, NotionDiffSummary, NotionOperation, NotionRichText, NotionSidecarBlock, NotionTree } from "./notion-sync.js";
export const notionProvider = Object.freeze({
  services: [notionService] as const,
});
