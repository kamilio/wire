import { randomBytes } from "node:crypto";
const prefix = "wire-editor-basis:";
const envelope = /<!--[ \t]*wire-editor-basis\b/gi;
export const hasEditorReceipt = (text) => text.search(envelope) >= 0;
const invalid = () => new Error("Invalid Wire editor receipt. The file was kept. Restore its original receipt or reconcile a plain copy before syncing.");
export function plainMarkdown(text) {
    if (hasEditorReceipt(text))
        throw invalid();
    return text;
}
export function editorView(raw, receipts) {
    if (!receipts)
        return { markdown: plainMarkdown(raw), shown: null, base: null };
    const mark = /\n<!-- wire-editor-basis:v1:([a-f0-9]{48}) -->/.exec(raw);
    if (!mark || raw.match(envelope)?.length !== 1)
        throw invalid();
    const record = receipts[mark[1]];
    if (!record || record.crlf !== (raw[mark.index - 1] === "\r"))
        throw invalid();
    const suffix = raw.slice(mark.index + mark[0].length);
    if (suffix && !/^(?:\r\n|\n)/.test(suffix))
        throw invalid();
    return { markdown: raw.slice(0, mark.index - Number(record.crlf)) + suffix, shown: record.shown, base: record.base };
}
export function editorFile(text, receipts, shown, base) {
    plainMarkdown(text);
    const crlf = text.endsWith("\r") || text.includes("\r\n");
    const existing = Object.entries(receipts).find(([, r]) => r.shown === shown && r.base === base && r.crlf === crlf);
    const key = existing?.[0] ?? randomBytes(24).toString("hex");
    receipts[key] = { shown, base, crlf };
    return text + (crlf ? "\r\n" : "\n") + "<!-- " + prefix + "v1:" + key + " -->";
}
//# sourceMappingURL=editor-receipts.js.map