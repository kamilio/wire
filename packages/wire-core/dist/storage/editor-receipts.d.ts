export { hasEditorReceipt, plainMarkdown } from "../core/editor-receipts.js";
export type EditorReceipts = Record<string, {
    shown: string;
    base: string;
    crlf: boolean;
}>;
export declare function editorView(raw: string, receipts?: EditorReceipts): {
    markdown: string;
    shown: null;
    base: null;
} | {
    markdown: string;
    shown: string;
    base: string;
};
export declare function editorFile(text: string, receipts: EditorReceipts, shown: string, base: string): string;
//# sourceMappingURL=editor-receipts.d.ts.map