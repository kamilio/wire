import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { googleDocOriginalImages } from "provider-google-docs";
import type { RuntimeCapabilities } from "wire-core";

const google = "application/vnd.google-apps.";
const formats: Record<string, [string, string]> = {
  document: [".md", "text/markdown"],
  spreadsheet: [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  presentation: [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  drawing: [".svg", "image/svg+xml"],
};
type File = { id: string; name: string; mimeType: string; version: string };
type Entry = { id: string; path?: string; version?: string; hash?: string; noText?: true; markdownOnly?: true; images?: string[]; originalImages?: true };
type State = { folder?: string; spreadsheet?: string; links?: Record<string, string[]>; entries: Record<string, Entry> };
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
async function stat(path: string) {
  try {
    return await lstat(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
async function save(path: string, data: string | Uint8Array) {
  const tmp = path + "." + randomUUID();
  await writeFile(tmp, data, { flag: "wx", mode: 0o600 });
  await rename(tmp, path);
}

const imageData = /data:image\/(png|jpeg|gif|webp);base64,([a-zA-Z0-9+/]+=*)/;
const imageDefinition = new RegExp("^\\[(image\\d+)\\]:[ \\t]*<?(" + imageData.source + ")>?[ \\t]*\\r?$", "gm");
const imageUse = new RegExp("(!\\[(?:\\\\.|[^\\]\\\\\\n])*\\])(?:\\[(image\\d+)\\]|\\(<?" + imageData.source + ">?\\))", "g");

async function docImageDir(full: string, create: boolean) {
  const root = join(dirname(full), "attachments"), folder = join(root, basename(full, ".md"));
  for (const path of [root, folder]) {
    const info = await stat(path);
    if (info && !info.isDirectory()) throw new Error("Expected an attachment directory: " + path);
    if (!info && create) await mkdir(path, { mode: 0o700 });
    if (!info && !create) break;
  }
  return folder;
}

async function checkDocImage(folder: string, name: string) {
  const hash = /^([a-f0-9]{64})\.(png|jpeg|gif|webp)$/.exec(name)?.[1];
  if (!hash) throw new Error("Invalid attachment name: " + name);
  const path = join(folder, name), info = await stat(path);
  if (!info) return false;
  if (!info.isFile() || digest(await readFile(path)) !== hash) throw new Error("Local attachment changed: " + path);
  return true;
}

async function extractDocImages(runtime: DriveRuntime, id: string, full: string, text: string) {
  const labels = new Set([...text.matchAll(imageDefinition)].map(m => m[1]));
  const images = [...text.matchAll(imageUse)].filter(m => m[2] === undefined || labels.has(m[2]));
  if (!images.length) return { bytes: Buffer.from(text), images: [] };
  const response = await drive(runtime, "/" + id + "/export", { mimeType: "application/zip" });
  const originals = googleDocOriginalImages(new Uint8Array(await response.arrayBuffer()));
  if (images.length !== originals.length) throw new Error("Image count differs between Google Docs Markdown and HTML exports; kept local copy.");
  const files = new Map<string, Uint8Array>(), links = new Map<string, string>();
  const dir = encodeURIComponent(basename(full, ".md")).replace(/[()]/g, c => c === "(" ? "%28" : "%29");
  let index = 0;
  text = text.replace(imageUse, (all, alt, label) => {
    if (label !== undefined && !labels.has(label)) return all;
    const { data, ext } = originals[index++]!;
    const name = digest(data) + "." + ext, url = "attachments/" + dir + "/" + name;
    files.set(name, data);
    if (label) links.set(label, url);
    return alt + "(" + url + ")";
  });
  text = text.replace(imageDefinition, (line, label, _uri, _ext, _data, offset) => {
    const url = links.get(label);
    if (!url) return line;
    return (text.slice(0, offset) + text.slice(offset + line.length)).includes("[" + label + "]")
      ? "[" + label + "]: <" + url + ">" : "";
  });
  const folder = await docImageDir(full, true);
  for (const [name, data] of files) {
    if (!(await checkDocImage(folder, name))) await writeFile(join(folder, name), data, { flag: "wx", mode: 0o600 });
  }
  return { bytes: Buffer.from(text), images: [...files.keys()] };
}

type DriveRuntime = Pick<RuntimeCapabilities, "googleFormsTokens" | "http">;
const folderUrl = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?(?:[?#].*)?$/;
const sheetUrl = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]+)(?:[/?#].*)?$/;
const safeName = (name: string) => name.replace(/[/\\:\x00-\x1f]/g, "_").replace(/^\.+/, "_") || "_";
async function drive(runtime: DriveRuntime, path: string, params: Record<string, string>) {
  const token = await runtime.googleFormsTokens.load();
  const response = await runtime.http.request(
    "https://www.googleapis.com/drive/v3/files" + path + "?" + new URLSearchParams(params),
    {
      headers: { authorization: "Bearer " + token.token },
    },
  );
  if (!response.ok) throw new Error("Drive HTTP " + response.status + ": " + (await response.text()).slice(0, 600));
  return response;
}

async function* children(runtime: DriveRuntime, parent: string) {
  let pageToken = "";
  do {
    const page = (await (
      await drive(runtime, "", {
        q: "'" + parent + "' in parents and trashed=false",
        fields: "nextPageToken,files(id,name,mimeType,version)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        pageSize: "1000",
        ...(pageToken ? { pageToken } : {}),
      })
    ).json()) as { nextPageToken?: string; files: File[] };
    yield* page.files;
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
}

export async function previewDrive(runtime: DriveRuntime, url: string) {
  const id = folderUrl.exec(url)?.[1] ?? /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)(?:[/?#].*)?$/.exec(url)?.[1];
  if (!id) throw new Error("Expected a Drive folder or file URL.");
  const item: File = await (
    await drive(runtime, "/" + id, { fields: "id,name,mimeType", supportsAllDrives: "true" })
  ).json();
  if (item.mimeType === google + "folder") {
    const rows = ["# " + item.name, ""];
    for await (const f of children(runtime, id)) {
      const link = f.mimeType === google + "folder" ? "drive/folders/" + f.id : "file/d/" + f.id + "/view";
      rows.push("- [" + f.name.replace(/[\[\]\n]/g, "_") + "](https://drive.google.com/" + link + ")");
    }
    return rows.join("\n");
  }
  const format =
    item.mimeType === google + "document"
      ? "text/markdown"
      : item.mimeType === google + "spreadsheet"
        ? "text/csv"
        : item.mimeType === google + "presentation"
          ? "text/plain"
          : undefined;
  if (format) return (await drive(runtime, "/" + id + "/export", { mimeType: format })).text();
  if (item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name)) {
    const response = await drive(runtime, "/" + id, { alt: "media", supportsAllDrives: "true" });
    return (
      (await import("./drive-pdf.js")).pdfMarkdown(new Uint8Array(await response.arrayBuffer())) ??
      item.name + ": image-only PDF (no text layer)."
    );
  }
  if (item.mimeType.startsWith("text/"))
    return (await drive(runtime, "/" + id, { alt: "media", supportsAllDrives: "true" })).text();
  return "# " + item.name + "\n\n" + item.mimeType;
}

type SheetCell = {
  formattedValue?: string; hyperlink?: string; userEnteredValue?: { stringValue?: string; formulaValue?: string };
  textFormatRuns?: { format?: { link?: { uri?: string } } }[];
  userEnteredFormat?: { textFormat?: { link?: { uri?: string } } };
  chipRuns?: { chip?: { richLinkProperties?: { uri?: string } } }[];
};

async function sheetLinks(runtime: DriveRuntime, id: string) {
  const fields = "sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,hyperlink,userEnteredValue,textFormatRuns(format/link),userEnteredFormat/textFormat/link,chipRuns(chip/richLinkProperties/uri)))))";
  const token = await runtime.googleFormsTokens.load();
  const response = await runtime.http.request("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "?" + new URLSearchParams({ fields }), { headers: { authorization: "Bearer " + token.token } });
  if (!response.ok) throw new Error("Sheets HTTP " + response.status + ": " + (await response.text()).slice(0, 600));
  type Sheet = { properties: { title: string }; data?: { startRow?: number; startColumn?: number; rowData?: { values?: SheetCell[] }[] }[] };
  const { sheets } = await response.json() as { sheets: Sheet[] };
  const links: Record<string, string[]> = Object.create(null);
  const labels = new Map<string, string>();
  for (const tab of sheets) for (const grid of tab.data ?? []) {
    for (const [r, row] of (grid.rowData ?? []).entries()) for (const [c, cell] of (row.values ?? []).entries()) {
      const texts = [cell.hyperlink, cell.formattedValue, cell.userEnteredValue?.stringValue, cell.userEnteredValue?.formulaValue,
        cell.userEnteredFormat?.textFormat?.link?.uri,
        ...(cell.textFormatRuns ?? []).map(run => run.format?.link?.uri),
        ...(cell.chipRuns ?? []).map(run => run.chip?.richLinkProperties?.uri)];
      const targets = new Set<string>();
      for (const text of texts) for (const m of (text ?? "").matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
        let url: URL;
        try { url = new URL(m[0]); } catch { continue; }
        if (url.hostname !== "docs.google.com" && url.hostname !== "drive.google.com") continue;
        const target = /\/(?:d|folders)\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1] ?? url.searchParams.get("id");
        if (!target || !/^[\w-]+$/.test(target) || target === id) continue;
        targets.add(target);
        let n = c + (grid.startColumn ?? 0) + 1, col = "";
        while (n) { n--; col = String.fromCharCode(65 + n % 26) + col; n = Math.floor(n / 26); }
        const ref = tab.properties.title + "!" + col + (r + (grid.startRow ?? 0) + 1);
        const refs = links[target] ??= [];
        if (!refs.includes(ref)) refs.push(ref);
      }
      const label = cell.formattedValue?.trim();
      if (targets.size === 1 && label && label.length <= 120 && !/https?:\/\//i.test(label)) {
        const [target] = targets;
        if (!labels.has(target!)) labels.set(target!, label);
      }
    }
  }
  return { links, labels };
}

export async function scrapeDrive(runtime: DriveRuntime, cwd: string, url?: string, deleteVerifiedPdfs = false) {
  const sheet = url?.match(sheetUrl)?.[1], folder = url?.match(folderUrl)?.[1];
  if (url && !sheet && !folder) throw new Error("Expected a Google Drive folder or Google Sheets URL.");
  const metadata = async (id: string): Promise<File> => (await drive(runtime, "/" + encodeURIComponent(id), { fields: "id,name,mimeType,version", supportsAllDrives: "true" })).json();
  let root: File | undefined;
  if (sheet || folder) {
    root = await metadata((sheet ?? folder)!);
    if (root.mimeType !== google + (sheet ? "spreadsheet" : "folder")) throw new Error("Drive file type does not match the URL.");
    const name = safeName(root.name);
    if (basename(cwd) !== name) {
      cwd = join(cwd, name);
      if (!(await stat(cwd))) await mkdir(cwd, { mode: 0o700 });
      if (!(await lstat(cwd)).isDirectory()) throw new Error("Expected a local directory: " + cwd);
    }
  }
  const manifest = join(cwd, ".wire-gdrive.json");
  const state: State = (await stat(manifest))?.isFile()
    ? JSON.parse(await readFile(manifest, "utf8"))
    : { ...(sheet ? { spreadsheet: sheet } : { folder }), entries: {} };
  const source = state.spreadsheet ?? state.folder;
  if (!source) throw new Error("Pass a Drive folder or Google Sheets URL on the first scrape.");
  if ((sheet && sheet !== state.spreadsheet) || (folder && folder !== state.folder)) throw new Error("This directory tracks a different Drive source.");
  root ??= await metadata(source);
  let downloaded = 0,
    unchanged = 0,
    removed = 0;
  const errors: string[] = [],
    skipped: string[] = [],
    images: string[] = [];
  const priorPaths = new Map(Object.values(state.entries).filter(e => e.path).map(e => [e.id, e.path!]));
  let labels = new Map<string, string>();
  async function visit(files: AsyncIterable<File> | Iterable<File>, dir: string) {
    for await (const f of files) {
      try {
        if (f.name.endsWith(".cannedSearch") || f.name === ".DS_Store") continue;
        const folder = f.mimeType === google + "folder",
          pdf = f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name);
        const format = formats[f.mimeType.slice(google.length)];
        if (!folder && !format && f.mimeType.startsWith(google)) {
          skipped.push(f.name);
          continue;
        }
        const extension = extname(f.name), title = basename(f.name, extension);
        const opaque = title === f.id || /^(?:[a-f\d]{24,}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(title);
        const label = labels.get(f.id);
        const name = safeName(opaque && label ? label + (label.toLowerCase().endsWith(extension.toLowerCase()) ? "" : extension) : f.name);
        const suff = format?.[0] ?? (pdf && !/\.pdf$/i.test(name) ? ".pdf" : "");
        let path = join(dir, name + (name.endsWith(suff) ? "" : suff));
        // Existing scrapes keep their original sidecar paths.
        const markdownPath = () => state.entries[key(path + ".md")]?.id !== f.id && /\.pdf$/i.test(path)
          ? path.slice(0, -4) + ".md" : path + ".md";
        const paths = () => (pdf ? [path, markdownPath()] : [path]);
        const key = (p: string) => "./" + p.normalize("NFC").toLowerCase();
        const occupied = async () => {
          for (const p of paths()) {
            const owner = state.entries[key(p)];
            if (owner ? owner.id !== f.id : await stat(join(cwd, p))) return true;
          }
          return false;
        };
        const base = path, ext = extname(base), stem = base.slice(0, base.length - ext.length);
        const prior = priorPaths.get(f.id);
        const oldName = safeName(f.name), oldExt = format?.[0] ?? "";
        const oldBase = join(dir, oldName + (oldName.endsWith(oldExt) ? "" : oldExt));
        const oldSuffix = extname(oldBase);
        const legacy = [oldBase, oldBase.slice(0, oldBase.length - oldSuffix.length) + " (" + f.id + ")" + oldSuffix];
        const saved = prior && dirname(prior) === dirname(base) ? prior : legacy.find(p => state.entries[key(p)]?.id === f.id);
        if (saved) path = saved;
        for (let n = 2; await occupied(); n++) {
          if (saved) throw new Error("Destination name is already in use.");
          path = stem + " (" + n + ")" + ext;
        }
        const full = join(cwd, path);
        if (folder) {
          if (!(await stat(full))) await mkdir(full, { mode: 0o700 });
          if (!(await lstat(full)).isDirectory()) throw new Error("Expected a local directory.");
          state.entries[key(path)] = { id: f.id, path };
          await visit(children(runtime, f.id), path);
          continue;
        }
        const original = state.entries[key(path)];
        const removeVerified = async (bytes: Uint8Array, md: Buffer) => {
          const { verifiedPdf } = await import("./drive-pdf.js");
          if (!verifiedPdf(bytes, md.toString("utf8"))) return;
          // Recheck both local files after verification, before removing the managed copy.
          for (const p of paths()) {
            const local = join(cwd, p);
            if (!(await lstat(local)).isFile() || digest(await readFile(local)) !== state.entries[key(p)]?.hash)
              throw new Error("Local file changed: " + p);
          }
          await unlink(full);
          state.entries[key(path)]!.markdownOnly = true;
          removed++;
        };
        let current = true;
        for (const p of paths()) {
          const entry = state.entries[key(p)],
            info = await stat(join(cwd, p));
          if (!info && p !== path && original?.noText) continue;
          if (!info && p === path && original?.markdownOnly && original.version === f.version) continue;
          if (info && (!info.isFile() || digest(await readFile(join(cwd, p))) !== entry?.hash))
            throw new Error("Local file changed: " + p);
          if (!info || entry?.version !== f.version) current = false;
        }
        if (current && f.mimeType === google + "document") {
          if (original?.images?.length) {
            const dir = await docImageDir(full, false);
            for (const image of original.images) if (!(await checkDocImage(dir, image))) current = false;
            if (!original.originalImages) current = false;
          } else if (!original?.images) {
            // Upgrade prior exports using their Markdown and the original HTML media.
            const local = await extractDocImages(runtime, f.id, full, await readFile(full, "utf8"));
            if (local.images.length) {
              await save(full, local.bytes);
              original!.hash = digest(local.bytes);
            }
            original!.images = local.images;
            original!.originalImages = true;
          }
        }
        if (current) {
          if (state.entries[key(path)]?.noText) images.push(path);
          if (pdf && deleteVerifiedPdfs && !original?.noText && (await stat(full)))
            await removeVerified(await readFile(full), await readFile(join(cwd, markdownPath())));
          original!.path = path;
          unchanged++;
          continue;
        }
        const response = format
          ? await drive(runtime, "/" + f.id + "/export", { mimeType: format[1] })
          : await drive(runtime, "/" + f.id, { alt: "media", supportsAllDrives: "true" });
        const raw = new Uint8Array(await response.arrayBuffer());
        const doc = f.mimeType === google + "document" ? await extractDocImages(runtime, f.id, full, Buffer.from(raw).toString("utf8")) : undefined;
        const bytes = doc?.bytes ?? raw;
        await save(full, bytes);
        state.entries[key(path)] = { id: f.id, path, version: f.version, hash: digest(bytes), ...(doc ? { images: doc.images, originalImages: true } : {}) };
        if (pdf) {
          const { pdfMarkdown } = await import("./drive-pdf.js");
          const text = pdfMarkdown(bytes);
          if (text === null) {
            state.entries[key(path)]!.noText = true;
            images.push(path);
            downloaded++;
            continue;
          }
          const md = Buffer.from(text);
          const sidecar = markdownPath();
          await save(join(cwd, sidecar), md);
          state.entries[key(sidecar)] = { id: f.id, version: f.version, hash: digest(md) };
          if (deleteVerifiedPdfs) await removeVerified(bytes, md);
        }
        downloaded++;
      } catch (e) {
        errors.push(join(dir, f.name) + ": " + (e as Error).message);
      }
    }
  }
  try {
    if (state.spreadsheet) {
      await visit([root], "");
      const cells = await sheetLinks(runtime, source);
      state.links = cells.links;
      labels = cells.labels;
      for (const [id, refs] of Object.entries(state.links)) {
        try {
          const file = await metadata(id);
          if (file.mimeType === google + "folder") skipped.push(file.name + " (linked folder)");
          else await visit([file], "");
        } catch (e) { errors.push(refs.join(", ") + " (" + id + "): " + (e as Error).message); }
      }
    } else await visit(children(runtime, source), "");
  } finally {
    await save(manifest, JSON.stringify(state, null, 2) + "\n");
  }
  const summary =
    "Drive: " +
    downloaded +
    " downloaded, " +
    unchanged +
    " unchanged." +
    (removed ? " Verified Markdown; removed " + removed + " local PDF copies." : "") +
    (images.length ? "\nPDFs with no text layer (originals kept): " + images.join(", ") : "") +
    (skipped.length ? "\nUnsupported Drive items: " + skipped.join(", ") : "");
  if (errors.length) throw new Error(summary + "\n" + errors.join("\n"));
  return summary;
}
