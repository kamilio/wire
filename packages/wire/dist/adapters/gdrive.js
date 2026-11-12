import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
const google = "application/vnd.google-apps.";
const formats = {
    document: [".md", "text/markdown"],
    spreadsheet: [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    presentation: [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    drawing: [".svg", "image/svg+xml"],
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
async function stat(path) {
    try {
        return await lstat(path);
    }
    catch (e) {
        if (e.code !== "ENOENT")
            throw e;
    }
}
async function save(path, data) {
    const tmp = path + "." + randomUUID();
    await writeFile(tmp, data, { flag: "wx", mode: 0o600 });
    await rename(tmp, path);
}
const imageData = /data:image\/(png|jpeg|gif|webp);base64,([a-zA-Z0-9+/]+=*)/;
const imageDefinition = new RegExp("^\\[(image\\d+)\\]:[ \\t]*<?(" + imageData.source + ")>?[ \\t]*\\r?$", "gm");
const inlineImage = new RegExp("(!\\[(?:\\\\.|[^\\]\\\\\\n])*\\])\\(<?(" + imageData.source + ")>?\\)", "g");
async function docImageDir(full, create) {
    const root = join(dirname(full), "attachments"), folder = join(root, basename(full, ".md"));
    for (const path of [root, folder]) {
        const info = await stat(path);
        if (info && !info.isDirectory())
            throw new Error("Expected an attachment directory: " + path);
        if (!info && create)
            await mkdir(path, { mode: 0o700 });
        if (!info && !create)
            break;
    }
    return folder;
}
async function checkDocImage(folder, name) {
    const hash = /^([a-f0-9]{64})\.(png|jpeg|gif|webp)$/.exec(name)?.[1];
    if (!hash)
        throw new Error("Invalid attachment name: " + name);
    const path = join(folder, name), info = await stat(path);
    if (!info)
        return false;
    if (!info.isFile() || digest(await readFile(path)) !== hash)
        throw new Error("Local attachment changed: " + path);
    return true;
}
async function extractDocImages(full, text) {
    const files = new Map(), links = new Map();
    const link = (ext, base64) => {
        const data = Buffer.from(base64, "base64");
        if (data.toString("base64") !== base64)
            throw new Error("Invalid image encoding.");
        const name = digest(data) + "." + ext;
        files.set(name, data);
        return "attachments/" + encodeURIComponent(basename(full, ".md")).replace(/[()]/g, c => c === "(" ? "%28" : "%29") + "/" + name;
    };
    for (const m of text.matchAll(imageDefinition))
        links.set(m[1], link(m[3], m[4]));
    text = text.replace(inlineImage, (_, alt, _uri, ext, data) => alt + "(" + link(ext, data) + ")");
    if (links.size) {
        text = text.replace(/(!\[(?:\\.|[^\]\\\n])*\])\[(image\d+)\]/g, (all, alt, id) => links.has(id) ? alt + "(" + links.get(id) + ")" : all);
        // Keep a relative definition for ordinary links that use the same reference.
        text = text.replace(imageDefinition, (line, id, _uri, _ext, _data, offset) => (text.slice(0, offset) + text.slice(offset + line.length)).includes("[" + id + "]")
            ? "[" + id + "]: <" + links.get(id) + ">" : "");
    }
    if (files.size) {
        const folder = await docImageDir(full, true);
        for (const [name, data] of files) {
            if (!(await checkDocImage(folder, name)))
                await writeFile(join(folder, name), data, { flag: "wx", mode: 0o600 });
        }
    }
    return { bytes: Buffer.from(text), images: [...files.keys()] };
}
const folderUrl = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?(?:[?#].*)?$/;
const safeName = (name) => name.replace(/[/\\:\x00-\x1f]/g, "_").replace(/^\.+/, "_") || "_";
async function drive(runtime, path, params) {
    const token = await runtime.googleFormsTokens.load();
    const response = await runtime.http.request("https://www.googleapis.com/drive/v3/files" + path + "?" + new URLSearchParams(params), {
        headers: { authorization: "Bearer " + token.token },
    });
    if (!response.ok)
        throw new Error("Drive HTTP " + response.status + ": " + (await response.text()).slice(0, 600));
    return response;
}
async function* children(runtime, parent) {
    let pageToken = "";
    do {
        const page = (await (await drive(runtime, "", {
            q: "'" + parent + "' in parents and trashed=false",
            fields: "nextPageToken,files(id,name,mimeType,version)",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
            pageSize: "1000",
            ...(pageToken ? { pageToken } : {}),
        })).json());
        yield* page.files;
        pageToken = page.nextPageToken ?? "";
    } while (pageToken);
}
export async function previewDrive(runtime, url) {
    const id = folderUrl.exec(url)?.[1] ?? /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)(?:[/?#].*)?$/.exec(url)?.[1];
    if (!id)
        throw new Error("Expected a Drive folder or file URL.");
    const item = await (await drive(runtime, "/" + id, { fields: "id,name,mimeType", supportsAllDrives: "true" })).json();
    if (item.mimeType === google + "folder") {
        const rows = ["# " + item.name, ""];
        for await (const f of children(runtime, id)) {
            const link = f.mimeType === google + "folder" ? "drive/folders/" + f.id : "file/d/" + f.id + "/view";
            rows.push("- [" + f.name.replace(/[\[\]\n]/g, "_") + "](https://drive.google.com/" + link + ")");
        }
        return rows.join("\n");
    }
    const format = item.mimeType === google + "document"
        ? "text/markdown"
        : item.mimeType === google + "spreadsheet"
            ? "text/csv"
            : item.mimeType === google + "presentation"
                ? "text/plain"
                : undefined;
    if (format)
        return (await drive(runtime, "/" + id + "/export", { mimeType: format })).text();
    if (item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name)) {
        const response = await drive(runtime, "/" + id, { alt: "media", supportsAllDrives: "true" });
        return ((await import("./drive-pdf.js")).pdfMarkdown(new Uint8Array(await response.arrayBuffer())) ??
            item.name + ": image-only PDF (no text layer).");
    }
    if (item.mimeType.startsWith("text/"))
        return (await drive(runtime, "/" + id, { alt: "media", supportsAllDrives: "true" })).text();
    return "# " + item.name + "\n\n" + item.mimeType;
}
export async function scrapeDrive(runtime, cwd, url) {
    const match = url?.match(folderUrl);
    if (url && !match)
        throw new Error("Expected a Google Drive folder URL.");
    if (match) {
        const root = await (await drive(runtime, "/" + match[1], { fields: "name,mimeType", supportsAllDrives: "true" })).json();
        if (root.mimeType !== google + "folder")
            throw new Error("The URL must identify a Drive folder.");
        const name = safeName(root.name);
        if (basename(cwd) !== name) {
            cwd = join(cwd, name);
            if (!(await stat(cwd)))
                await mkdir(cwd, { mode: 0o700 });
            if (!(await lstat(cwd)).isDirectory())
                throw new Error("Expected a local directory: " + cwd);
        }
    }
    const manifest = join(cwd, ".wire-gdrive.json");
    const state = (await stat(manifest))?.isFile()
        ? JSON.parse(await readFile(manifest, "utf8"))
        : { folder: match?.[1], entries: {} };
    if (!state.folder)
        throw new Error("Pass a Drive folder URL on the first scrape.");
    if (!match)
        await drive(runtime, "/" + encodeURIComponent(state.folder), { fields: "id", supportsAllDrives: "true" });
    if (match && state.folder !== match[1])
        throw new Error("This directory tracks a different Drive folder.");
    let downloaded = 0, unchanged = 0, removed = 0;
    const errors = [], skipped = [], images = [];
    async function visit(parent, dir) {
        for await (const f of children(runtime, parent)) {
            try {
                if (f.name.endsWith(".cannedSearch") || f.name === ".DS_Store")
                    continue;
                const folder = f.mimeType === google + "folder", pdf = f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name);
                const format = formats[f.mimeType.slice(google.length)];
                if (!folder && !format && f.mimeType.startsWith(google)) {
                    skipped.push(f.name);
                    continue;
                }
                const name = safeName(f.name);
                const suff = format?.[0] ?? "";
                let path = join(dir, name + (name.endsWith(suff) ? "" : suff));
                const paths = () => (pdf ? [path, path + ".md"] : [path]);
                const key = (p) => "./" + p.normalize("NFC").toLowerCase();
                const occupied = async () => {
                    for (const p of paths()) {
                        const owner = state.entries[key(p)];
                        if (owner ? owner.id !== f.id : await stat(join(cwd, p)))
                            return true;
                    }
                    return false;
                };
                if (await occupied()) {
                    const ext = extname(path);
                    path = (ext ? path.slice(0, -ext.length) : path) + " (" + f.id + ")" + ext;
                    if (await occupied())
                        throw new Error("Destination name is already in use.");
                }
                const full = join(cwd, path);
                if (folder) {
                    if (!(await stat(full)))
                        await mkdir(full, { mode: 0o700 });
                    if (!(await lstat(full)).isDirectory())
                        throw new Error("Expected a local directory.");
                    state.entries[key(path)] = { id: f.id };
                    await visit(f.id, path);
                    continue;
                }
                const original = state.entries[key(path)];
                const removeVerified = async (bytes, md) => {
                    const { verifiedPdf } = await import("./drive-pdf.js");
                    if (!verifiedPdf(bytes, md.toString("utf8")))
                        return;
                    // Recheck both local files after verification, before removing the managed copy.
                    for (const p of paths()) {
                        const local = join(cwd, p);
                        if (!(await lstat(local)).isFile() || digest(await readFile(local)) !== state.entries[key(p)]?.hash)
                            throw new Error("Local file changed: " + p);
                    }
                    await unlink(full);
                    state.entries[key(path)].markdownOnly = true;
                    removed++;
                };
                let current = true;
                for (const p of paths()) {
                    const entry = state.entries[key(p)], info = await stat(join(cwd, p));
                    if (!info && p !== path && original?.noText)
                        continue;
                    if (!info && p === path && original?.markdownOnly && original.version === f.version)
                        continue;
                    if (info && (!info.isFile() || digest(await readFile(join(cwd, p))) !== entry?.hash))
                        throw new Error("Local file changed: " + p);
                    if (!info || entry?.version !== f.version)
                        current = false;
                }
                if (current && f.mimeType === google + "document") {
                    if (original?.images?.length) {
                        const dir = await docImageDir(full, false);
                        for (const image of original.images)
                            if (!(await checkDocImage(dir, image)))
                                current = false;
                    }
                    else if (!original?.images) {
                        // Upgrade prior exports on refresh, without another network request.
                        const local = await extractDocImages(full, await readFile(full, "utf8"));
                        if (local.images.length) {
                            await save(full, local.bytes);
                            original.hash = digest(local.bytes);
                        }
                        original.images = local.images;
                    }
                }
                if (current) {
                    if (state.entries[key(path)]?.noText)
                        images.push(path);
                    if (pdf && !original?.noText && (await stat(full)))
                        await removeVerified(await readFile(full), await readFile(full + ".md"));
                    unchanged++;
                    continue;
                }
                const response = format
                    ? await drive(runtime, "/" + f.id + "/export", { mimeType: format[1] })
                    : await drive(runtime, "/" + f.id, { alt: "media", supportsAllDrives: "true" });
                const raw = new Uint8Array(await response.arrayBuffer());
                const doc = f.mimeType === google + "document" ? await extractDocImages(full, Buffer.from(raw).toString("utf8")) : undefined;
                const bytes = doc?.bytes ?? raw;
                await save(full, bytes);
                state.entries[key(path)] = { id: f.id, version: f.version, hash: digest(bytes), ...(doc ? { images: doc.images } : {}) };
                if (pdf) {
                    const { pdfMarkdown } = await import("./drive-pdf.js");
                    const text = pdfMarkdown(bytes);
                    if (text === null) {
                        state.entries[key(path)].noText = true;
                        images.push(path);
                        downloaded++;
                        continue;
                    }
                    const md = Buffer.from(text);
                    await save(full + ".md", md);
                    state.entries[key(path + ".md")] = { id: f.id, version: f.version, hash: digest(md) };
                    await removeVerified(bytes, md);
                }
                downloaded++;
            }
            catch (e) {
                errors.push(join(dir, f.name) + ": " + e.message);
            }
        }
    }
    try {
        await visit(state.folder, "");
    }
    finally {
        await save(manifest, JSON.stringify(state, null, 2) + "\n");
    }
    const summary = "Drive: " +
        downloaded +
        " downloaded, " +
        unchanged +
        " unchanged." +
        (removed ? " Verified Markdown; removed " + removed + " local PDF copies." : "") +
        (images.length ? "\nPDFs with no text layer (originals kept): " + images.join(", ") : "") +
        (skipped.length ? "\nUnsupported Drive items: " + skipped.join(", ") : "");
    if (errors.length)
        throw new Error(summary + "\n" + errors.join("\n"));
    return summary;
}
//# sourceMappingURL=gdrive.js.map