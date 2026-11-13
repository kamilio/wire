import { randomBytes } from "node:crypto";
import { invalidReceipt, plainMarkdown, receiptEnvelope } from "../core/editor-receipts.js";
export { hasEditorReceipt, plainMarkdown } from "../core/editor-receipts.js";
const prefix = "wire-editor-basis:";
export function editorView(raw, receipts) {
    if (!receipts)
        return { markdown: plainMarkdown(raw), shown: null, base: null };
    const mark = /\n<!-- wire-editor-basis:v1:([a-f0-9]{48}) -->/.exec(raw);
    if (!mark || raw.match(receiptEnvelope)?.length !== 1)
        throw invalidReceipt();
    const record = receipts[mark[1]];
    if (!record || record.crlf !== (raw[mark.index - 1] === "\r"))
        throw invalidReceipt();
    const suffix = raw.slice(mark.index + mark[0].length);
    if (suffix && !/^(?:\r\n|\n)/.test(suffix))
        throw invalidReceipt();
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