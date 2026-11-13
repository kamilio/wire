export type EditorReceipts = Record<string, {
    shown: string;
    base: string;
    crlf: boolean;
}>;
export declare const hasEditorReceipt: (text: string) => boolean;
export declare function plainMarkdown(text: string): string;
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