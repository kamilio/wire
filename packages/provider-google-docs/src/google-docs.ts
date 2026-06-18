import { defineService } from "wire-core";
import type { FetchedDocument, JsonObject, JsonValue, RuntimeCapabilities, Source } from "wire-core";

async function cookieHeader(runtime: RuntimeCapabilities): Promise<string> {
  const cookies = await runtime.cookies.loadSaved("google-docs");
  if (cookies === null) throw cookieAuthenticationError();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function cookieAuthenticationError(): Error {
  return new Error("google-docs cookie authentication is missing or expired. Run `wire google-docs login` once; other commands reuse saved cookies.");
}

function filenameTitle(value: string, label: string): string {
  const encoded = /filename\*=UTF-8'[^']*'([^;]+)/i.exec(value);
  const quoted = /filename="([^"]+)"/i.exec(value);
  const bare = /filename=([^;]+)/i.exec(value);
  if (encoded === null && quoted === null && bare === null) throw new Error(`Google ${label} did not include a filename`);
  const filename = encoded !== null ? decodeURIComponent(encoded[1]!) : quoted !== null ? quoted[1]! : bare![1]!.trim();
  return filename.replace(/\.(csv|html|md|txt|xlsx)$/i, "");
}

async function googleExport(runtime: RuntimeCapabilities, url: string, label: string): Promise<Readonly<{ title: string; text: string }>> {
  const response = await runtime.http.request(url, { headers: { Cookie: await cookieHeader(runtime) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), text: await response.text() });
}

async function googleText(runtime: RuntimeCapabilities, url: string, label: string): Promise<string> {
  const response = await runtime.http.request(url, { headers: { Cookie: await cookieHeader(runtime) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  return response.text();
}

function saveResult(text: string, label: string): JsonObject {
  if (/^\s*</.test(text)) throw cookieAuthenticationError();
  if (!text.startsWith(")]}'\n")) throw new Error(`Google ${label} save failed: unexpected response`);
  return JSON.parse(text.slice(")]}'\n".length)) as JsonObject;
}

function objectValue(value: JsonValue): JsonObject {
  const object = value as JsonObject;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Google sync base must be an object");
  return object;
}

function parseCsv(value: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quoted) {
      if (char === "\"" && value[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length !== 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function stringRows(value: JsonValue): readonly (readonly string[])[] {
  if (!Array.isArray(value)) throw new Error("Google Sheets sync base must include rows");
  return value.map((row) => {
    if (!Array.isArray(row)) throw new Error("Google Sheets sync base rows must be arrays");
    return row.map((cell) => {
      if (typeof cell !== "string") throw new Error("Google Sheets sync base cells must be strings");
      return cell;
    });
  });
}

function markdownTableCell(value: string): string {
  const escaped = value.replace(/&amp;#(9|32);/g, "&amp;amp;#$1;").replace(/&#(9|32);/g, "&amp;#$1;").replace(/&amp;lt;br&amp;gt;/g, "&amp;amp;lt;br&amp;amp;gt;").replace(/&lt;br&gt;/g, "&amp;lt;br&amp;gt;").replace(/<br>/g, "&lt;br&gt;").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const text = escaped.replace(/^[ \t]+|[ \t]+$/g, (match) => match.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"));
  return text === "" ? " " : text;
}

function rowsMarkdown(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const tableRows = rows.map((row) => Array.from({ length: columnCount }, (_value, index) => markdownTableCell(index < row.length ? row[index]! : "")));
  return `${[
    `| ${tableRows[0]!.join(" | ")} |`,
    `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
    ...tableRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")}\n`;
}

function markdownTableRow(line: string): readonly string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "\t").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "\t").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
  return cells.map((item) => item === "" ? "" : item);
}

function parseMarkdownTable(markdown: string): readonly (readonly string[])[] {
  if (markdown.trim() === "") return [];
  const lines = markdown.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Google Sheets sync requires a Markdown table with a header row and separator row");
  const nonTableLine = lines.findIndex((line) => !line.includes("|"));
  if (nonTableLine !== -1) throw new Error(`Google Sheets sync requires a Markdown table: line ${nonTableLine + 1} is not a table row`);
  const separator = markdownTableRow(lines[1]!);
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) throw new Error("Google Sheets sync requires a Markdown table separator row at line 2");
  const rows = [markdownTableRow(lines[0]!), ...lines.slice(2).map(markdownTableRow)];
  const rowLengths = [rows[0]!, separator, ...rows.slice(1)];
  const invalidRow = rowLengths.findIndex((row) => row.length !== rows[0]!.length);
  if (invalidRow !== -1) throw new Error(`Google Sheets sync requires every Markdown table row to have ${rows[0]!.length} cells: line ${invalidRow + 1} has ${rowLengths[invalidRow]!.length}`);
  return rows;
}

function resourceKey(source: Source): string | null {
  const key = source["resource_key"];
  return typeof key === "string" && key !== "" ? key : null;
}

function sheetEditUrl(documentId: string, gid: string | null, key: string | null): string {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(documentId)}/edit`);
  if (gid !== null) url.searchParams.set("gid", gid);
  if (key !== null) url.searchParams.set("resourcekey", key);
  return url.toString();
}

function docEditUrl(documentId: string, key: string | null, tab: string): string {
  const url = new URL(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`);
  url.searchParams.set("tab", tab);
  if (key !== null) url.searchParams.set("resourcekey", key);
  return url.toString();
}

function documentTab(source: Source): string | null {
  const tab = source["document_tab"];
  return typeof tab === "string" && tab !== "" ? tab : null;
}

function urlParam(url: URL, name: string): string | null {
  const query = url.searchParams.get(name);
  const hash = new URLSearchParams(url.hash.slice(1)).get(name);
  return query !== null && query !== "" ? query : hash !== null && hash !== "" ? hash : null;
}

function sheetSession(html: string): Readonly<{ token: string; revision: number; sid: string; gridId: string }> {
  const tokenMatch = /"info_params":\{"token":"([^"]+)"/.exec(html);
  if (tokenMatch === null) throw cookieAuthenticationError();
  const token = tokenMatch[1]!;
  const start = html.indexOf("var bootstrapData = ");
  const end = html.indexOf("; function loadWaffle()", start);
  if (start === -1 || end === -1) throw new Error("Google Sheets editor did not include save metadata");
  const bootstrap = JSON.parse(html.slice(start + "var bootstrapData = ".length, end)) as JsonObject;
  const changesValue = bootstrap["changes"];
  if (changesValue === undefined) throw new Error("Google Sheets editor did not include save metadata");
  const changes = objectValue(changesValue);
  const revision = changes["revision"];
  const sid = changes["sid"];
  const gridId = bootstrap["gridId"];
  if (typeof revision !== "number" || typeof sid !== "string" || typeof gridId !== "number") throw new Error("Google Sheets editor did not include save metadata");
  return Object.freeze({ token, revision, sid, gridId: String(gridId) });
}

function changedCells(baseRows: readonly (readonly string[])[], localRows: readonly (readonly string[])[]): readonly Readonly<{ row: number; column: number; value: string }>[] {
  const rowCount = Math.max(baseRows.length, localRows.length);
  const cells: Readonly<{ row: number; column: number; value: string }>[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const baseRow = baseRows[row] ?? [];
    const localRow = localRows[row] ?? [];
    const columnCount = Math.max(baseRow.length, localRow.length);
    for (let column = 0; column < columnCount; column += 1) {
      const value = localRow[column] ?? "";
      if ((baseRow[column] ?? "") !== value) cells.push(Object.freeze({ row, column, value }));
    }
  }
  return cells;
}

function sheetCellCommand(gridId: string, row: number, column: number, value: string): readonly [number, string] {
  return [21299578, JSON.stringify([[gridId, row, row + 1, column, column + 1], [132274236, 3, [2, value], null, null, 0], [null, [[null, 513, [0], null, null, null, null, null, null, null, null, 0]]]])];
}

function formulaLikeCell(value: string): boolean {
  return value.startsWith("=") || value.startsWith("+") || value.startsWith("@") || /^-(?!\d+(?:\.\d+)?$)/.test(value);
}

async function uploadSheetRows(runtime: RuntimeCapabilities, documentId: string, gid: string | null, key: string | null, cells: readonly Readonly<{ row: number; column: number; value: string }>[]): Promise<void> {
  const session = sheetSession(await googleText(runtime, sheetEditUrl(documentId, gid, key), "Sheets editor"));
  const bundles = [{ commands: cells.map((cell) => sheetCellCommand(session.gridId, cell.row, cell.column, cell.value)), sid: session.sid, reqId: 0 }];
  const body = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify(bundles) });
  const response = await runtime.http.request(`https://docs.google.com/spreadsheets/u/0/d/${encodeURIComponent(documentId)}/save?id=${encodeURIComponent(documentId)}&token=${encodeURIComponent(session.token)}`, { method: "POST", headers: { Cookie: await cookieHeader(runtime), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: body.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Sheets save failed: HTTP ${response.status}`);
  const text = await response.text();
  const result = saveResult(text, "Sheets");
  if (result["revisionRanges"] === undefined) throw new Error("Google Sheets save failed: missing revision ranges");
}

function docSession(html: string): Readonly<{ token: string; ouid: string; revision: number; text: string }> {
  const tokenMatch = /"info_params":\{"token":"([^"]+)"/.exec(html);
  if (tokenMatch === null) throw cookieAuthenticationError();
  const token = tokenMatch[1]!;
  const ouidMatch = /"ouid":"([^"]+)"/.exec(html);
  const revisionMatch = /DOCS_warmStartDocumentLoader\.startLoad\(\s*([0-9.]+)/.exec(html);
  if (ouidMatch === null || revisionMatch === null) throw new Error("Google Docs editor did not include save metadata");
  const ouid = ouidMatch[1]!;
  const revision = Number(revisionMatch[1]!);
  const chunks: string[] = [];
  const pattern = /DOCS_modelChunk = (\{[\s\S]*?\}); DOCS_modelChunkLoadStart/g;
  let match = pattern.exec(html);
  while (match !== null) {
    const chunk = JSON.parse(match[1]!) as { readonly chunk: readonly JsonObject[] };
    for (const command of chunk.chunk) if (command["ty"] === "is") chunks.push(command["s"] as string);
    match = pattern.exec(html);
  }
  return Object.freeze({ token, ouid, revision, text: chunks.join("") });
}

function markdownDocTable(value: string): string {
  const lines = value.trimEnd().split(/\r?\n/);
  const separator = lines.findIndex((line) => markdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell)));
  if (separator === -1) return value;
  return `${lines.filter((_line, index) => index !== separator).flatMap((line) => markdownTableRow(line)).join("\n")}\n`;
}

function markdownEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" })[entity]!);
}

function markdownHtmlTags(value: string): string {
  return value.replace(/<\/?(?:u|sup|sub|mark|span)(?:\s+[^>]*)?>/gi, "");
}

function markdownCombinedEmphasis(value: string): string {
  return value.replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1").replace(/(^|[^\w])___([^_\n]+?)___(?=[^\w]|$)/g, "$1$2").replace(/\*\*_([^_\n]+)_\*\*/g, "$1").replace(/__\*([^*\n]+)\*__/g, "$1").replace(/\*__([^_\n]+)__\*/g, "$1").replace(/_\*\*([^*\n]+)\*\*_/g, "$1");
}

function markdownText(value: string): string {
  return markdownEntities(markdownHtmlTags(markdownCombinedEmphasis(value.replace(/[ \t]{2,}(?=\r?\n|$)/g, "").replace(/(?:^[ \t]*\|.*\|[ \t]*(?:\r?\n|$)){2,}/gm, markdownDocTable).replace(/^```[^\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm, "$1").replace(/^[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]+[^\n]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\r?\n)*/gm, "").replace(/[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*/g, " ").replace(/[ \t]*!\[[^\]\n]*\]\[[^\]\n]*\][ \t]*/g, " ").replace(/\\([\\`*_{}\[\]()#+\-.!|=~])/g, "$1").replace(/^[ \t]*>+[ \t]?/gm, "").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "").replace(/^\[(?: |x|X)\][ \t]+/gm, "").replace(/`([^`\n]+)`/g, "$1").replace(/~~([^~\n]+)~~/g, "$1").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, "$1$2").replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, "$1$2").replace(/^#+ /gm, "").replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1").replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))));
}

function comparableDocMarkdown(value: string): string {
  return markdownEntities(markdownHtmlTags(markdownCombinedEmphasis(value.replace(/[ \t]{2,}(?=\r?\n|$)/g, "").replace(/\\([\\`*_{}\[\]()#+\-.!|=~])/g, "$1").replace(/\s+$/g, ""))));
}

function docMarkdownEqual(left: string, right: string): boolean {
  return comparableDocMarkdown(left) === comparableDocMarkdown(right);
}

function textEdit(base: string, local: string): Readonly<{ base: string; local: string; before: string; after: string }> {
  let start = 0;
  while (start < base.length && start < local.length && base[start] === local[start]) start += 1;
  for (let window = 80; window >= 10; window -= 10) {
    for (let baseEnd = start; baseEnd <= Math.min(base.length - window, start + 2000); baseEnd += 1) {
      const anchor = base.slice(baseEnd, baseEnd + window);
      const localEnd = local.indexOf(anchor, start);
      if (localEnd !== -1 && localEnd <= start + 2000) return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), after: base.slice(baseEnd) });
    }
  }
  let baseEnd = base.length;
  let localEnd = local.length;
  while (baseEnd > start && localEnd > start && base[baseEnd - 1] === local[localEnd - 1]) { baseEnd -= 1; localEnd -= 1; }
  return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), after: base.slice(baseEnd) });
}

function context(value: string, side: "before" | "after", length: number): string {
  return side === "before" ? value.slice(Math.max(0, value.length - length)) : value.slice(0, length);
}

function followingWhitespaceEnd(text: string, index: number): number {
  let end = index;
  while (end < text.length && /\s/.test(text[end]!)) end += 1;
  return end;
}

function docTextRange(text: string, edit: Readonly<{ base: string; before: string; after: string }>): Readonly<{ start: number; end: number }> {
  const base = markdownText(edit.base);
  const beforeText = markdownText(edit.before);
  const afterText = markdownText(edit.after);
  const candidates: number[] = [];
  if (base === "") {
    if (beforeText !== "") {
      const anchor = context(beforeText, "before", Math.min(80, beforeText.length));
      const trimmed = anchor.replace(/\s+$/g, "");
      let index = 0;
      for (;;) {
        const found = text.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found + anchor.length);
        index = found + 1;
      }
      if (trimmed !== anchor) {
        index = 0;
        for (;;) {
          const found = text.indexOf(trimmed, index);
          if (found === -1) break;
          candidates.push(followingWhitespaceEnd(text, found + trimmed.length));
          index = found + 1;
        }
      }
    }
    if (afterText === "") {
      candidates.push(text.length);
    } else {
      const anchor = context(afterText, "after", Math.min(80, afterText.length));
      let index = 0;
      for (;;) {
        const found = text.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found);
        index = found + 1;
      }
    }
  } else {
    let index = 0;
    for (;;) {
      const found = text.indexOf(base, index);
      if (found === -1) break;
      candidates.push(found);
      index = found + 1;
    }
  }
  const uniqueCandidates = [...new Set(candidates)];
  for (const length of [80, 40, 20, 10, 0]) {
    const before = context(beforeText, "before", length);
    const after = context(afterText, "after", length);
    const matched = uniqueCandidates.filter((index) => text.slice(Math.max(0, index - before.length), index) === before && text.slice(index + base.length, index + base.length + after.length) === after);
    if (matched.length === 1) return Object.freeze({ start: matched[0]!, end: matched[0]! + base.length });
  }
  throw new Error("Google Docs local edit cannot be mapped to the live document text");
}

async function uploadDocText(runtime: RuntimeCapabilities, documentId: string, key: string | null, tab: string, baseMarkdown: string, localMarkdown: string): Promise<void> {
  const edit = textEdit(baseMarkdown, localMarkdown);
  const editUrl = docEditUrl(documentId, key, tab);
  const session = docSession(await googleText(runtime, editUrl, "Docs editor"));
  const range = docTextRange(session.text, edit);
  const sid = runtime.clock.now().getTime().toString(16).padStart(16, "0").slice(-16);
  const commands = [
    ...(range.start === range.end ? [] : [{ ty: "ds", si: range.start + 1, ei: range.end }]),
    ...(edit.local === "" ? [] : [{ ty: "is", ibi: range.start + 1, s: markdownText(edit.local) }]),
  ];
  const params = new URLSearchParams({ id: documentId, sid, vc: "1", c: "1", w: "1", flr: "0", smv: "2147483647", smb: "[2147483647, AAE=]", token: session.token, ouid: session.ouid, includes_info_params: "true", cros_files: "false", nded: "false", tab });
  const body = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify([{ commands, sid, reqId: 0 }]) });
  const response = await runtime.http.request(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/save?${params}`, { method: "POST", headers: { Cookie: await cookieHeader(runtime), "content-type": "application/x-www-form-urlencoded;charset=UTF-8", origin: "https://docs.google.com", referer: editUrl }, body: body.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Docs save failed: HTTP ${response.status}`);
  const text = await response.text();
  const result = saveResult(text, "Docs");
  if (result["revisionRanges"] === undefined) throw new Error("Google Docs save failed: missing revision ranges");
}

async function fetchGoogleDocument(runtime: RuntimeCapabilities, source: Source): Promise<FetchedDocument> {
  const documentId = (source["document_id"] as string | undefined) ?? source.identifier;
  let sheetGid: string | null = null;
  let exportUrl: string;
  let label: string;
  if (source["sheet_gid"] !== undefined) {
    const gid = source["sheet_gid"] as string | null;
    const query = new URLSearchParams({ format: "csv" });
    if (gid !== null) query.set("gid", gid);
    const key = resourceKey(source);
    if (key !== null) query.set("resourcekey", key);
    exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Sheets CSV export";
    sheetGid = gid;
  } else {
    const query = new URLSearchParams({ format: "md" });
    const key = resourceKey(source);
    if (key !== null) query.set("resourcekey", key);
    const tab = documentTab(source);
    if (tab !== null) query.set("tab", tab);
    exportUrl = `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Docs Markdown export";
  }
  const exported = await googleExport(runtime, exportUrl, label);
  const rows = source["sheet_gid"] === undefined ? null : parseCsv(exported.text);
  const markdown = rows === null ? exported.text : rowsMarkdown(rows);
  const tab = source["sheet_gid"] === undefined ? documentTab(source) : null;
  return Object.freeze({ title: exported.title, markdown, data: { document_id: documentId, title: exported.title, output_path: null, sheet_gid: sheetGid, markdown, rows, ...(tab === null ? {} : { document_tab: tab }) } });
}

async function synchronizeGoogleDocument(runtime: RuntimeCapabilities, _url: string, source: Source, base: JsonValue, markdown: string): Promise<FetchedDocument> {
  const remote = await fetchGoogleDocument(runtime, source);
  const baseMarkdown = objectValue(base)["markdown"];
  const label = source["sheet_gid"] === undefined ? "Google Docs" : "Google Sheets";
  if (typeof baseMarkdown !== "string") throw new Error("Google sync base must include markdown");
  if (source["sheet_gid"] === undefined && (docMarkdownEqual(markdown, baseMarkdown) || docMarkdownEqual(markdown, remote.markdown))) return remote;
  if (source["sheet_gid"] !== undefined && (markdown === baseMarkdown || markdown === remote.markdown)) return remote;
  if (remote.markdown === baseMarkdown && source["sheet_gid"] !== undefined) {
    const baseRows = stringRows(objectValue(base)["rows"]!);
    const localRows = parseMarkdownTable(markdown);
    const cells = changedCells(baseRows, localRows);
    if (cells.length === 0) return remote;
    const formula = cells.find((cell) => formulaLikeCell(cell.value));
    if (formula !== undefined) throw new Error(`Google Sheets sync cannot upload formula-like cell text at row ${formula.row + 1}, column ${formula.column + 1}\nPrefix it with an apostrophe or rewrite it as plain text before syncing.`);
    await uploadSheetRows(runtime, (source["document_id"] as string | undefined) ?? source.identifier, source["sheet_gid"] as string | null, resourceKey(source), cells);
    const uploaded = await fetchGoogleDocument(runtime, source);
    if (uploaded.markdown !== rowsMarkdown(localRows)) throw new Error("Google Sheets save verification failed");
    return uploaded;
  }
  if (source["sheet_gid"] === undefined && docMarkdownEqual(remote.markdown, baseMarkdown)) {
    if (markdownText(markdown) === markdownText(baseMarkdown)) throw new Error("Google Docs sync cannot upload formatting-only Markdown edits");
    await uploadDocText(runtime, (source["document_id"] as string | undefined) ?? source.identifier, resourceKey(source), documentTab(source) ?? "t.0", baseMarkdown, markdown);
    const uploaded = await fetchGoogleDocument(runtime, source);
    if (!docMarkdownEqual(uploaded.markdown, markdown)) throw new Error("Google Docs save verification failed");
    return uploaded;
  }
  throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
}

export const googleDocsService = defineService<RuntimeCapabilities>({
  name: "google-docs",
  matches: (url) => url.hostname === "docs.google.com" && /^\/(document|spreadsheets)(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
  parse: (url) => {
    const match = /^\/(document|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname)!;
    const documentId = match[2]!;
    const key = urlParam(url, "resourcekey");
    const resource_key = key === null || key === "" ? {} : { resource_key: key };
    if (match[1] === "spreadsheets") {
      const queryGid = url.searchParams.get("gid");
      const hashGid = new URLSearchParams(url.hash.slice(1)).get("gid");
      const gid = /^\d+$/.test(hashGid ?? "") ? hashGid : /^\d+$/.test(queryGid ?? "") ? queryGid : null;
      return Object.freeze({ service: "google-docs", identifier: `${documentId}#gid=${gid ?? "default"}`, type: "spreadsheet", document_id: documentId, sheet_gid: gid, ...resource_key });
    }
    const tab = urlParam(url, "tab");
    if (tab !== null && tab !== "" && tab !== "t.0") return Object.freeze({ service: "google-docs", identifier: `${documentId}#tab=${tab}`, type: "document", document_id: documentId, document_tab: tab, ...resource_key });
    return Object.freeze({ service: "google-docs", identifier: documentId, type: "document", ...resource_key });
  },
  fetch: (runtime, _url, source) => fetchGoogleDocument(runtime, source),
  synchronize: (runtime, url, source, base, markdown) => synchronizeGoogleDocument(runtime, url, source, base, markdown),
});
