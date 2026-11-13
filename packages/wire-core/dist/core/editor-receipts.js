export const receiptEnvelope = /<!--[ \t]*wire-editor-basis\b/gi;
export const hasEditorReceipt = (text) => text.search(receiptEnvelope) >= 0;
export const invalidReceipt = () => new Error("Invalid Wire editor receipt. The file was kept. Restore its original receipt or reconcile a plain copy before syncing.");
export function plainMarkdown(text) {
    if (hasEditorReceipt(text))
        throw invalidReceipt();
    return text;
}
//# sourceMappingURL=editor-receipts.js.map