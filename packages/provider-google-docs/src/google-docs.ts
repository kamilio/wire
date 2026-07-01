import { defineService } from "wire-core";
import { inflateRawSync } from "node:zlib";
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
  return filename.replace(/\.(csv|html|md|pptx|txt|xlsx)$/i, "");
}

async function googleExport(runtime: RuntimeCapabilities, url: string, label: string): Promise<Readonly<{ title: string; text: string }>> {
  const response = await runtime.http.request(url, { headers: { Cookie: await cookieHeader(runtime) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), text: await response.text() });
}

async function googleExportBytes(runtime: RuntimeCapabilities, url: string, label: string): Promise<Readonly<{ title: string; bytes: Uint8Array }>> {
  const response = await runtime.http.request(url, { headers: { Cookie: await cookieHeader(runtime) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), bytes: new Uint8Array(await response.arrayBuffer()) });
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

type XmlChild = XmlNode | string;
type XmlNode = Readonly<{ name: string; attributes: ReadonlyMap<string, string>; children: readonly XmlChild[] }>;

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "apos") return "'";
    throw new Error(`PPTX XML unknown entity: ${entity}`);
  });
}

function xmlTagEnd(xml: string, start: number): number {
  let quote: string | null = null;
  for (let index = start + 1; index < xml.length; index += 1) {
    const char = xml[index]!;
    if (quote === null && char === ">") return index;
    if (quote === null && (char === "\"" || char === "'")) quote = char;
    else if (quote === char) quote = null;
  }
  throw new Error("PPTX XML tag is unterminated");
}

function parseAttributes(value: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index]!)) index += 1;
    if (index >= value.length) break;
    const nameStart = index;
    while (index < value.length && !/[\s=]/.test(value[index]!)) index += 1;
    const name = value.slice(nameStart, index);
    while (index < value.length && /\s/.test(value[index]!)) index += 1;
    if (value[index] !== "=") throw new Error(`PPTX XML attribute ${name} is invalid`);
    index += 1;
    while (index < value.length && /\s/.test(value[index]!)) index += 1;
    const quote = value[index]!;
    if (quote !== "\"" && quote !== "'") throw new Error(`PPTX XML attribute ${name} is unquoted`);
    index += 1;
    const textStart = index;
    while (index < value.length && value[index] !== quote) index += 1;
    attributes.set(name, decodeXml(value.slice(textStart, index)));
    index += 1;
  }
  return attributes;
}

function parseXml(xml: string): XmlNode {
  const root: { name: string; attributes: ReadonlyMap<string, string>; children: XmlChild[] } = { name: "#document", attributes: new Map(), children: [] };
  const stack: { name: string; attributes: ReadonlyMap<string, string>; children: XmlChild[] }[] = [root];
  let index = 0;
  while (index < xml.length) {
    if (xml.startsWith("<?", index)) {
      index = xml.indexOf("?>", index) + 2;
    } else if (xml.startsWith("<!--", index)) {
      index = xml.indexOf("-->", index) + 3;
    } else if (xml.startsWith("<![CDATA[", index)) {
      const end = xml.indexOf("]]>", index);
      stack[stack.length - 1]!.children.push(xml.slice(index + 9, end));
      index = end + 3;
    } else if (xml.startsWith("</", index)) {
      const end = xmlTagEnd(xml, index);
      const name = xml.slice(index + 2, end).trim();
      const node = stack.pop()!;
      if (node.name !== name) throw new Error(`PPTX XML closing tag mismatch: ${name}`);
      stack[stack.length - 1]!.children.push(Object.freeze({ name: node.name, attributes: node.attributes, children: Object.freeze(node.children) }));
      index = end + 1;
    } else if (xml[index] === "<") {
      const end = xmlTagEnd(xml, index);
      const raw = xml.slice(index + 1, end).trim();
      const selfClosing = raw.endsWith("/");
      const tag = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
      const nameEnd = tag.search(/\s/);
      const name = nameEnd === -1 ? tag : tag.slice(0, nameEnd);
      const attributes = parseAttributes(nameEnd === -1 ? "" : tag.slice(nameEnd + 1));
      if (selfClosing) stack[stack.length - 1]!.children.push(Object.freeze({ name, attributes, children: Object.freeze([]) }));
      else stack.push({ name, attributes, children: [] });
      index = end + 1;
    } else {
      const end = xml.indexOf("<", index);
      const text = decodeXml(xml.slice(index, end === -1 ? xml.length : end));
      if (text !== "") stack[stack.length - 1]!.children.push(text);
      index = end === -1 ? xml.length : end;
    }
  }
  if (stack.length !== 1) throw new Error("PPTX XML document is unclosed");
  return Object.freeze({ name: root.name, attributes: root.attributes, children: Object.freeze(root.children) });
}

function isXmlNode(value: XmlChild): value is XmlNode {
  return typeof value !== "string";
}

function xmlChildren(node: XmlNode, name: string): readonly XmlNode[] {
  return node.children.filter(isXmlNode).filter((child) => child.name === name);
}

function xmlDescendants(node: XmlNode, name: string): readonly XmlNode[] {
  return node.children.filter(isXmlNode).flatMap((child) => child.name === name ? [child, ...xmlDescendants(child, name)] : xmlDescendants(child, name));
}

function xmlText(node: XmlNode): string {
  return node.children.map((child) => typeof child === "string" ? child : xmlText(child)).join("");
}

function xmlAttribute(node: XmlNode, name: string): string {
  const value = node.attributes.get(name);
  if (value === undefined) throw new Error(`PPTX XML missing ${name}`);
  return value;
}

function zipEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  throw new Error("PPTX ZIP missing central directory");
}

function unzipFiles(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = zipEndOfCentralDirectory(bytes);
  const totalEntries = view.getUint16(end + 10, true);
  let centralOffset = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("PPTX ZIP central directory entry is invalid");
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("PPTX ZIP local file entry is invalid");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, inflateRawSync(compressed));
    else throw new Error(`PPTX ZIP compression method is unsupported: ${method}`);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function zipText(files: ReadonlyMap<string, Uint8Array>, name: string): string {
  const bytes = files.get(name);
  if (bytes === undefined) throw new Error(`PPTX missing ${name}`);
  return new TextDecoder().decode(bytes);
}

function relationshipTargets(xml: string): ReadonlyMap<string, string> {
  const relationships = new Map<string, string>();
  for (const relationship of xmlDescendants(parseXml(xml), "Relationship")) relationships.set(xmlAttribute(relationship, "Id"), xmlAttribute(relationship, "Target"));
  return relationships;
}

function resolvePartPath(basePath: string, target: string): string {
  const parts = basePath.split("/");
  parts.pop();
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

function slidePartPaths(files: ReadonlyMap<string, Uint8Array>): readonly string[] {
  const presentation = parseXml(zipText(files, "ppt/presentation.xml"));
  const relationships = relationshipTargets(zipText(files, "ppt/_rels/presentation.xml.rels"));
  const slides = xmlDescendants(presentation, "p:sldId");
  if (slides.length === 0) throw new Error("PPTX presentation has no slides");
  return slides.map((slide) => {
    const id = xmlAttribute(slide, "r:id");
    const target = relationships.get(id);
    if (target === undefined) throw new Error(`PPTX presentation missing slide relationship ${id}`);
    return resolvePartPath("ppt/presentation.xml", target);
  });
}

function slideRelationshipsPath(slidePath: string): string {
  const parts = slidePath.split("/");
  const filename = parts.pop();
  if (filename === undefined) throw new Error("PPTX slide path is invalid");
  parts.push("_rels", `${filename}.rels`);
  return parts.join("/");
}

function markdownSpan(value: string, left: string, right: string): string {
  const leading = /^[ \t]*/.exec(value)![0];
  const trailing = /[ \t]*$/.exec(value)![0];
  const core = value.slice(leading.length, value.length - trailing.length);
  return core === "" ? value : `${leading}${left}${core}${right}${trailing}`;
}

function linkMarkdown(value: string, target: string): string {
  const leading = /^[ \t]*/.exec(value)![0];
  const trailing = /[ \t]*$/.exec(value)![0];
  const core = value.slice(leading.length, value.length - trailing.length);
  return core === "" ? value : `${leading}[${core.replace(/[[\]\\]/g, "\\$&")}](${target.replace(/\)/g, "%29")})${trailing}`;
}

function formattedRunMarkdown(run: XmlNode, relationships: ReadonlyMap<string, string>): string {
  const text = xmlDescendants(run, "a:t").map(xmlText).join("");
  const runProperties = xmlChildren(run, "a:rPr")[0];
  if (runProperties === undefined) return text;
  const hyperlink = xmlDescendants(runProperties, "a:hlinkClick")[0];
  let markdown = text;
  if (runProperties.attributes.get("u") !== undefined && runProperties.attributes.get("u") !== "none" && hyperlink === undefined) markdown = markdownSpan(markdown, "<u>", "</u>");
  if (runProperties.attributes.get("strike") !== undefined && runProperties.attributes.get("strike") !== "noStrike") markdown = markdownSpan(markdown, "~~", "~~");
  if (runProperties.attributes.get("b") === "1" && runProperties.attributes.get("i") === "1") markdown = markdownSpan(markdown, "***", "***");
  else if (runProperties.attributes.get("b") === "1") markdown = markdownSpan(markdown, "**", "**");
  else if (runProperties.attributes.get("i") === "1") markdown = markdownSpan(markdown, "_", "_");
  if (hyperlink !== undefined) {
    const id = xmlAttribute(hyperlink, "r:id");
    const target = relationships.get(id);
    if (target === undefined) throw new Error(`PPTX slide missing hyperlink relationship ${id}`);
    markdown = linkMarkdown(markdown, target);
  }
  return markdown;
}

function paragraphMarkdown(paragraph: XmlNode, relationships: ReadonlyMap<string, string>): Readonly<{ text: string; list: "bullet" | "number" | null; level: number }> {
  const pPr = xmlChildren(paragraph, "a:pPr")[0];
  const list = pPr === undefined || xmlChildren(pPr, "a:buNone").length !== 0 ? null : xmlChildren(pPr, "a:buAutoNum").length !== 0 ? "number" : xmlChildren(pPr, "a:buChar").length !== 0 ? "bullet" : null;
  const levelValue = pPr === undefined ? undefined : pPr.attributes.get("lvl");
  const level = levelValue === undefined ? 0 : Number(levelValue);
  const pieces: string[] = [];
  for (const child of paragraph.children.filter(isXmlNode)) {
    if (child.name === "a:br") pieces.push("\n");
    if (child.name === "a:r" || child.name === "a:fld") pieces.push(formattedRunMarkdown(child, relationships));
  }
  return Object.freeze({ text: pieces.join("").replace(/[ \t]+$/gm, ""), list, level });
}

function slideMarkdown(slide: XmlNode, relationships: ReadonlyMap<string, string>): string {
  const paragraphs = xmlDescendants(slide, "a:p").map((paragraph) => paragraphMarkdown(paragraph, relationships)).filter((paragraph) => paragraph.text.trim() !== "");
  const lines = paragraphs.map((paragraph, index) => {
    if (index === 0 && paragraph.list === null) return `## ${paragraph.text.trim()}`;
    if (paragraph.list === "bullet") return `${"  ".repeat(paragraph.level)}- ${paragraph.text.trim()}`;
    if (paragraph.list === "number") return `${"  ".repeat(paragraph.level)}1. ${paragraph.text.trim()}`;
    return paragraph.text.trim();
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function slidesMarkdown(bytes: Uint8Array): string {
  const files = unzipFiles(bytes);
  const slides = slidePartPaths(files).map((slidePath) => {
    const slide = parseXml(zipText(files, slidePath));
    const relationships = relationshipTargets(zipText(files, slideRelationshipsPath(slidePath)));
    return slideMarkdown(slide, relationships);
  });
  return `${slides.join("\n\n---\n\n")}\n`;
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

type TextEdit = Readonly<{ base: string; local: string; before: string; after: string; localAfter: string }>;
type MarkdownSpan = Readonly<{ start: number; end: number }>;

function textEdit(base: string, local: string): TextEdit {
  let start = 0;
  while (start < base.length && start < local.length && base[start] === local[start]) start += 1;
  for (let window = 80; window >= 10; window -= 10) {
    for (let baseEnd = start; baseEnd <= Math.min(base.length - window, start + 2000); baseEnd += 1) {
      const anchor = base.slice(baseEnd, baseEnd + window);
      const localEnd = local.indexOf(anchor, start);
      if (localEnd !== -1 && localEnd <= start + 2000) return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), after: base.slice(baseEnd), localAfter: local.slice(localEnd) });
    }
  }
  let baseEnd = base.length;
  let localEnd = local.length;
  while (baseEnd > start && localEnd > start && base[baseEnd - 1] === local[localEnd - 1]) { baseEnd -= 1; localEnd -= 1; }
  return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), after: base.slice(baseEnd), localAfter: local.slice(localEnd) });
}

function textEdits(base: string, local: string): readonly TextEdit[] {
  const edits: TextEdit[] = [];
  let basePrefix = "";
  let baseRest = base;
  let localRest = local;
  while (baseRest !== localRest) {
    const edit = textEdit(baseRest, localRest);
    const before = `${basePrefix}${edit.before}`;
    edits.push(Object.freeze({ ...edit, before }));
    basePrefix = base.slice(0, base.length - edit.after.length);
    baseRest = edit.after;
    localRest = edit.localAfter;
  }
  return edits;
}

function inlineMarkdownSpans(value: string): readonly MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  for (const pattern of [/\[[^\]\n]+\]\([^)]+\)/g, /!\[[^\]\n]*\]\([^)]+\)/g, /`[^`\n]+`/g, /~~[^~\n]+~~/g, /\*\*[^*\n]+\*\*/g, /\*[^*\n]+\*/g, /(^|[^\w])__[^_\n]+__(?=[^\w]|$)/g, /(^|[^\w])_[^_\n]+_(?=[^\w]|$)/g, /<((?:https?|mailto):[^>\s]+)>/g, /<\/?(?:u|sup|sub|mark|span)(?:\s+[^>]*)?>/gi]) {
    let match = pattern.exec(value);
    while (match !== null) {
      spans.push(Object.freeze({ start: match.index, end: match.index + match[0]!.length }));
      match = pattern.exec(value);
    }
  }
  return spans;
}

function editTouchesMarkdownSpan(edit: TextEdit, value: string): boolean {
  const start = edit.before.length;
  const end = start + edit.base.length;
  return inlineMarkdownSpans(value).some((span) => start === end ? start > span.start && start < span.end : start < span.end && end > span.start);
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
  const edits = textEdits(baseMarkdown, localMarkdown);
  if (edits.some((edit) => editTouchesMarkdownSpan(edit, baseMarkdown))) throw new Error("Google Docs sync cannot preserve formatting in edited text");
  const editUrl = docEditUrl(documentId, key, tab);
  const session = docSession(await googleText(runtime, editUrl, "Docs editor"));
  const ranges = edits.map((edit) => ({ edit, range: docTextRange(session.text, edit) })).sort((left, right) => right.range.start - left.range.start);
  const sid = runtime.clock.now().getTime().toString(16).padStart(16, "0").slice(-16);
  const commands = ranges.flatMap(({ edit, range }) => [
    ...(range.start === range.end ? [] : [{ ty: "ds", si: range.start + 1, ei: range.end }]),
    ...(edit.local === "" ? [] : [{ ty: "is", ibi: range.start + 1, s: markdownText(edit.local) }]),
  ]);
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
  } else if (source.type === "presentation") {
    const query = new URLSearchParams({ format: "pptx" });
    const key = resourceKey(source);
    if (key !== null) query.set("resourcekey", key);
    exportUrl = `https://docs.google.com/presentation/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Slides PPTX export";
  } else {
    const query = new URLSearchParams({ format: "md" });
    const key = resourceKey(source);
    if (key !== null) query.set("resourcekey", key);
    const tab = documentTab(source);
    if (tab !== null) query.set("tab", tab);
    exportUrl = `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Docs Markdown export";
  }
  if (source.type === "presentation") {
    const exported = await googleExportBytes(runtime, exportUrl, label);
    const markdown = slidesMarkdown(exported.bytes);
    return Object.freeze({ title: exported.title, markdown, data: { document_id: documentId, title: exported.title, output_path: null, sheet_gid: sheetGid, markdown, rows: null, presentation: true } });
  }
  const exported = await googleExport(runtime, exportUrl, label);
  const rows = source["sheet_gid"] === undefined ? null : parseCsv(exported.text);
  const markdown = rows === null ? exported.text : rowsMarkdown(rows);
  const tab = source["sheet_gid"] === undefined ? documentTab(source) : null;
  return Object.freeze({ title: exported.title, markdown, data: { document_id: documentId, title: exported.title, output_path: null, sheet_gid: sheetGid, markdown, rows, ...(tab === null ? {} : { document_tab: tab }) } });
}

async function synchronizeGoogleDocument(runtime: RuntimeCapabilities, _url: string, source: Source, base: JsonValue, markdown: string): Promise<FetchedDocument> {
  const remote = await fetchGoogleDocument(runtime, source);
  if (source.type === "presentation") {
    const baseMarkdown = objectValue(base)["markdown"];
    if (typeof baseMarkdown !== "string") throw new Error("Google sync base must include markdown");
    if (markdown === baseMarkdown || markdown === remote.markdown) return remote;
    if (remote.markdown === baseMarkdown) throw new Error("Google Slides sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
    throw new Error("Google Slides changed remotely and locally. Resolve the conflict in Google Slides or the local Markdown file before syncing again.");
  }
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
  matches: (url) => url.hostname === "docs.google.com" && /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
  parse: (url) => {
    const match = /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname)!;
    const documentId = match[2]!;
    const key = urlParam(url, "resourcekey");
    const resource_key = key === null || key === "" ? {} : { resource_key: key };
    if (match[1] === "presentation") return Object.freeze({ service: "google-docs", identifier: documentId, type: "presentation", ...resource_key });
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
