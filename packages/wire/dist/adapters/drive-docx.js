import { spawnSync } from "node:child_process";
import { convert } from "#docx-converter";
export async function docxMarkdown(bytes) {
    const result = await convert([{ bytes }], { from: "docx", to: "markdown" }, {});
    if (result.kind !== "text" || !result.text.trim() || result.diagnostics.length)
        throw new Error("DOCX conversion was empty or reported a warning; original kept.");
    return result.text;
}
// The independent reader can omit separate Word stories and embedded objects.
// Only accept ordinary text packages and compare the complete document trees.
export function verifiedDocx(path, bytes, markdown) {
    const checked = (cmd, args, input) => {
        const r = spawnSync(cmd, args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
        return r.status === 0 && !r.error && !r.stderr ? r.stdout : null;
    };
    const entries = checked("unzip", ["-Z1", path]);
    if (!entries || !entries.trim().split("\n").every(p => /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:core|app)\.xml|word\/(?:document|styles|numbering|settings|fontTable|webSettings|theme\/theme\d+)\.xml|word\/_rels\/document\.xml\.rels)$/.test(p)))
        return false;
    const xml = checked("unzip", ["-p", path, "word/document.xml"]);
    if (!xml || /<(?:[\w.-]+:)?(?:drawing|pict|object|altChunk|txbxContent|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|AlternateContent|sym)\b/.test(xml))
        return false;
    const ast = checked("pandoc", ["--from=docx", "--track-changes=all", "--to=json"], bytes);
    return !!ast && ast === checked("pandoc", ["--from=markdown", "--to=json"], markdown);
}
//# sourceMappingURL=drive-docx.js.map