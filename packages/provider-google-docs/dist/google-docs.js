import { defineService } from "wire-core";
import { docBlocks, mergeDocBlocks } from "./doc-blocks.js";
import { googleRead } from "./google-read.js";
import { captureDuplicateIdentity, duplicateContext, hasDuplicateSlots, alreadyAppliedPlainLabelMove, nativeDocMarkdownEqual, nativeDocsGrant, StaleDocRevision, tryUploadDocBlocks } from "./native-docs.js";
import { inflateRawSync } from "node:zlib";
async function cookieHeader(runtime) {
    const cookies = await runtime.cookies.loadSaved("google-docs");
    if (cookies === null)
        throw cookieAuthenticationError();
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function cookieAuthenticationError() {
    return new Error("google-docs cookie authentication is missing or expired. Run `wire google-docs login` once; other commands reuse saved cookies.");
}
function filenameTitle(value, label) {
    const encoded = /filename\*=UTF-8'[^']*'([^;]+)/i.exec(value);
    const quoted = /filename="([^"]+)"/i.exec(value);
    const bare = /filename=([^;]+)/i.exec(value);
    if (encoded === null && quoted === null && bare === null)
        throw new Error(`Google ${label} did not include a filename`);
    const filename = encoded !== null ? decodeURIComponent(encoded[1]) : quoted !== null ? quoted[1] : bare[1].trim();
    return filename.replace(/\.(csv|html|md|pptx|txt|xlsx)$/i, "");
}
async function docExportRequest(runtime, url, token) {
    if (token === null) {
        const init = { headers: { Cookie: await cookieHeader(runtime) } };
        return url.startsWith("https://docs.google.com/document/") ? googleRead(runtime, url, init) : runtime.http.request(url, init);
    }
    // The tab-specific export accepts OAuth and returns a signed download URL.
    // Never forward the access token to the download host or to a login page.
    const first = await googleRead(runtime, url, { headers: { Authorization: "Bearer " + token }, redirect: "manual" });
    if (first.status < 300 || first.status >= 400)
        return first;
    const location = first.headers.get("location");
    if (!location)
        throw new Error("Google Docs export did not include a download URL");
    const target = new URL(location);
    if (target.protocol !== "https:" || !target.hostname.endsWith(".googleusercontent.com") || target.username || target.password || target.port)
        throw new Error("Google Docs export returned an unexpected download URL");
    return googleRead(runtime, target, { redirect: "error" });
}
async function googleExport(runtime, url, label, token = null) {
    const response = await docExportRequest(runtime, url, token);
    if (response.status === 401 || response.status === 403) {
        if (token !== null)
            throw new Error(`Google ${label} failed: OAuth access denied (HTTP ${response.status})`);
        throw cookieAuthenticationError();
    }
    if (!response.ok)
        throw new Error(`Google ${label} failed: HTTP ${response.status}`);
    const disposition = response.headers.get("content-disposition");
    if (disposition === null) {
        if (token !== null)
            throw new Error(`Google ${label} did not include a filename`);
        throw cookieAuthenticationError();
    }
    return Object.freeze({ title: filenameTitle(disposition, label), text: await response.text() });
}
async function googleExportBytes(runtime, url, label, token = null) {
    const response = await docExportRequest(runtime, url, token);
    if (response.status === 401 || response.status === 403) {
        if (token !== null)
            throw new Error(`Google ${label} failed: OAuth access denied (HTTP ${response.status})`);
        throw cookieAuthenticationError();
    }
    if (!response.ok)
        throw new Error(`Google ${label} failed: HTTP ${response.status}`);
    const disposition = response.headers.get("content-disposition");
    if (disposition === null) {
        if (token !== null)
            throw new Error(`Google ${label} did not include a filename`);
        throw cookieAuthenticationError();
    }
    return Object.freeze({ title: filenameTitle(disposition, label), bytes: new Uint8Array(await response.arrayBuffer()) });
}
async function googleText(runtime, url, label) {
    const response = await runtime.http.request(url, { headers: { Cookie: await cookieHeader(runtime) } });
    if (response.status === 401 || response.status === 403)
        throw cookieAuthenticationError();
    if (!response.ok)
        throw new Error(`Google ${label} failed: HTTP ${response.status}`);
    return response.text();
}
function saveResult(text, label) {
    if (/^\s*</.test(text))
        throw cookieAuthenticationError();
    if (!text.startsWith(")]}'\n"))
        throw new Error(`Google ${label} save failed: unexpected response`);
    return JSON.parse(text.slice(")]}'\n".length));
}
function objectValue(value) {
    const object = value;
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Google sync base must be an object");
    return object;
}
function parseCsv(value) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quoted) {
            if (char === "\"" && value[index + 1] === "\"") {
                cell += "\"";
                index += 1;
            }
            else if (char === "\"") {
                quoted = false;
            }
            else {
                cell += char;
            }
        }
        else if (char === "\"") {
            quoted = true;
        }
        else if (char === ",") {
            row.push(cell);
            cell = "";
        }
        else if (char === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        }
        else if (char !== "\r") {
            cell += char;
        }
    }
    if (cell !== "" || row.length !== 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
function stringRows(value) {
    if (!Array.isArray(value))
        throw new Error("Google Sheets sync base must include rows");
    return value.map((row) => {
        if (!Array.isArray(row))
            throw new Error("Google Sheets sync base rows must be arrays");
        return row.map((cell) => {
            if (typeof cell !== "string")
                throw new Error("Google Sheets sync base cells must be strings");
            return cell;
        });
    });
}
function markdownTableCell(value) {
    const escaped = value.replace(/&amp;#(9|32);/g, "&amp;amp;#$1;").replace(/&#(9|32);/g, "&amp;#$1;").replace(/&amp;lt;br&amp;gt;/g, "&amp;amp;lt;br&amp;amp;gt;").replace(/&lt;br&gt;/g, "&amp;lt;br&amp;gt;").replace(/<br>/g, "&lt;br&gt;").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
    const text = escaped.replace(/^[ \t]+|[ \t]+$/g, (match) => match.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"));
    return text === "" ? " " : text;
}
function rowsMarkdown(rows) {
    if (rows.length === 0)
        return "";
    const columnCount = Math.max(...rows.map((row) => row.length));
    const tableRows = rows.map((row) => Array.from({ length: columnCount }, (_value, index) => markdownTableCell(index < row.length ? row[index] : "")));
    return `${[
        `| ${tableRows[0].join(" | ")} |`,
        `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
        ...tableRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ].join("\n")}\n`;
}
function csvCell(value) {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}
function rowsCsv(rows) {
    return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
function sheetMarkdown(rows) {
    if (rows.length === 0)
        return "";
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (rows[0].length === columnCount && rows[0].every((cell) => cell !== ""))
        return rowsMarkdown(rows);
    return `\`\`\`csv\n${rowsCsv(rows)}\`\`\`\n`;
}
function markdownTableRow(line) {
    let value = line.trim();
    if (value.startsWith("|"))
        value = value.slice(1);
    if (value.endsWith("|"))
        value = value.slice(0, -1);
    const cells = [];
    let cell = "";
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === "\\" && value[index + 1] === "|") {
            cell += "|";
            index += 1;
        }
        else if (char === "|") {
            cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "\t").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
            cell = "";
        }
        else {
            cell += char;
        }
    }
    cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "\t").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
    return cells.map((item) => item === "" ? "" : item);
}
function parseMarkdownTable(markdown) {
    if (markdown.trim() === "")
        return [];
    const lines = markdown.trim().split(/\r?\n/);
    if (lines.length < 2)
        throw new Error("Google Sheets sync requires a Markdown table with a header row and separator row");
    const nonTableLine = lines.findIndex((line) => !line.includes("|"));
    if (nonTableLine !== -1)
        throw new Error(`Google Sheets sync requires a Markdown table: line ${nonTableLine + 1} is not a table row`);
    const separator = markdownTableRow(lines[1]);
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell)))
        throw new Error("Google Sheets sync requires a Markdown table separator row at line 2");
    const rows = [markdownTableRow(lines[0]), ...lines.slice(2).map(markdownTableRow)];
    const rowLengths = [rows[0], separator, ...rows.slice(1)];
    const invalidRow = rowLengths.findIndex((row) => row.length !== rows[0].length);
    if (invalidRow !== -1)
        throw new Error(`Google Sheets sync requires every Markdown table row to have ${rows[0].length} cells: line ${invalidRow + 1} has ${rowLengths[invalidRow].length}`);
    return rows;
}
function parseSheetMarkdown(markdown) {
    if (markdown.trim() === "")
        return [];
    const value = markdown.trimEnd();
    if (!value.startsWith("```csv\n"))
        return parseMarkdownTable(markdown);
    if (!value.endsWith("\n```"))
        throw new Error("Google Sheets sync requires fenced CSV to end with ```");
    return parseCsv(value.slice("```csv\n".length, -"\n```".length));
}
function rowsEqual(left, right) {
    return left.length === right.length && left.every((row, rowIndex) => row.length === right[rowIndex].length && row.every((cell, columnIndex) => cell === right[rowIndex][columnIndex]));
}
function resourceKey(source) {
    const key = source["resource_key"];
    return typeof key === "string" && key !== "" ? key : null;
}
function sheetEditUrl(documentId, gid, key) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(documentId)}/edit`);
    if (gid !== null)
        url.searchParams.set("gid", gid);
    if (key !== null)
        url.searchParams.set("resourcekey", key);
    return url.toString();
}
function documentTab(source) {
    const tab = source["document_tab"];
    return typeof tab === "string" && tab !== "" ? tab : null;
}
function decodeXml(value) {
    return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, entity) => {
        if (entity.startsWith("#x"))
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        if (entity.startsWith("#"))
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        if (entity === "amp")
            return "&";
        if (entity === "lt")
            return "<";
        if (entity === "gt")
            return ">";
        if (entity === "quot")
            return "\"";
        if (entity === "apos")
            return "'";
        throw new Error(`PPTX XML unknown entity: ${entity}`);
    });
}
function xmlTagEnd(xml, start) {
    let quote = null;
    for (let index = start + 1; index < xml.length; index += 1) {
        const char = xml[index];
        if (quote === null && char === ">")
            return index;
        if (quote === null && (char === "\"" || char === "'"))
            quote = char;
        else if (quote === char)
            quote = null;
    }
    throw new Error("PPTX XML tag is unterminated");
}
function parseAttributes(value) {
    const attributes = new Map();
    let index = 0;
    while (index < value.length) {
        while (index < value.length && /\s/.test(value[index]))
            index += 1;
        if (index >= value.length)
            break;
        const nameStart = index;
        while (index < value.length && !/[\s=]/.test(value[index]))
            index += 1;
        const name = value.slice(nameStart, index);
        while (index < value.length && /\s/.test(value[index]))
            index += 1;
        if (value[index] !== "=")
            throw new Error(`PPTX XML attribute ${name} is invalid`);
        index += 1;
        while (index < value.length && /\s/.test(value[index]))
            index += 1;
        const quote = value[index];
        if (quote !== "\"" && quote !== "'")
            throw new Error(`PPTX XML attribute ${name} is unquoted`);
        index += 1;
        const textStart = index;
        while (index < value.length && value[index] !== quote)
            index += 1;
        attributes.set(name, decodeXml(value.slice(textStart, index)));
        index += 1;
    }
    return attributes;
}
function parseXml(xml) {
    const root = { name: "#document", attributes: new Map(), children: [] };
    const stack = [root];
    let index = 0;
    while (index < xml.length) {
        if (xml.startsWith("<?", index)) {
            index = xml.indexOf("?>", index) + 2;
        }
        else if (xml.startsWith("<!--", index)) {
            index = xml.indexOf("-->", index) + 3;
        }
        else if (xml.startsWith("<![CDATA[", index)) {
            const end = xml.indexOf("]]>", index);
            stack[stack.length - 1].children.push(xml.slice(index + 9, end));
            index = end + 3;
        }
        else if (xml.startsWith("</", index)) {
            const end = xmlTagEnd(xml, index);
            const name = xml.slice(index + 2, end).trim();
            const node = stack.pop();
            if (node.name !== name)
                throw new Error(`PPTX XML closing tag mismatch: ${name}`);
            stack[stack.length - 1].children.push(Object.freeze({ name: node.name, attributes: node.attributes, children: Object.freeze(node.children) }));
            index = end + 1;
        }
        else if (xml[index] === "<") {
            const end = xmlTagEnd(xml, index);
            const raw = xml.slice(index + 1, end).trim();
            const selfClosing = raw.endsWith("/");
            const tag = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
            const nameEnd = tag.search(/\s/);
            const name = nameEnd === -1 ? tag : tag.slice(0, nameEnd);
            const attributes = parseAttributes(nameEnd === -1 ? "" : tag.slice(nameEnd + 1));
            if (selfClosing)
                stack[stack.length - 1].children.push(Object.freeze({ name, attributes, children: Object.freeze([]) }));
            else
                stack.push({ name, attributes, children: [] });
            index = end + 1;
        }
        else {
            const end = xml.indexOf("<", index);
            const text = decodeXml(xml.slice(index, end === -1 ? xml.length : end));
            if (text !== "")
                stack[stack.length - 1].children.push(text);
            index = end === -1 ? xml.length : end;
        }
    }
    if (stack.length !== 1)
        throw new Error("PPTX XML document is unclosed");
    return Object.freeze({ name: root.name, attributes: root.attributes, children: Object.freeze(root.children) });
}
function isXmlNode(value) {
    return typeof value !== "string";
}
function xmlChildren(node, name) {
    return node.children.filter(isXmlNode).filter((child) => child.name === name);
}
function xmlDescendants(node, name) {
    return node.children.filter(isXmlNode).flatMap((child) => child.name === name ? [child, ...xmlDescendants(child, name)] : xmlDescendants(child, name));
}
function xmlText(node) {
    return node.children.map((child) => typeof child === "string" ? child : xmlText(child)).join("");
}
function xmlAttribute(node, name) {
    const value = node.attributes.get(name);
    if (value === undefined)
        throw new Error(`PPTX XML missing ${name}`);
    return value;
}
function zipEndOfCentralDirectory(bytes) {
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
        if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06)
            return index;
    }
    throw new Error("Google export ZIP missing central directory");
}
function unzipFiles(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = zipEndOfCentralDirectory(bytes);
    const totalEntries = view.getUint16(end + 10, true);
    let centralOffset = view.getUint32(end + 16, true);
    const files = new Map();
    const decoder = new TextDecoder();
    for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
        if (view.getUint32(centralOffset, true) !== 0x02014b50)
            throw new Error("Google export ZIP central directory entry is invalid");
        const method = view.getUint16(centralOffset + 10, true);
        const compressedSize = view.getUint32(centralOffset + 20, true);
        const nameLength = view.getUint16(centralOffset + 28, true);
        const extraLength = view.getUint16(centralOffset + 30, true);
        const commentLength = view.getUint16(centralOffset + 32, true);
        const localOffset = view.getUint32(centralOffset + 42, true);
        const name = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
        if (view.getUint32(localOffset, true) !== 0x04034b50)
            throw new Error("Google export ZIP local file entry is invalid");
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
        if (method === 0)
            files.set(name, compressed);
        else if (method === 8)
            files.set(name, inflateRawSync(compressed));
        else
            throw new Error(`Google export ZIP compression method is unsupported: ${method}`);
        centralOffset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
}
export function googleDocOriginalImages(bytes) {
    const files = unzipFiles(bytes);
    const pages = [...files.keys()].filter(name => /\.html?$/i.test(name));
    if (pages.length !== 1)
        throw new Error("Expected one page in Google Docs HTML export");
    const html = new TextDecoder().decode(files.get(pages[0]));
    return [...html.matchAll(/(?:<span\b((?:[^>"']|"[^"]*"|'[^']*')*)>\s*)?<img\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map(match => {
        const attrs = parseAttributes(match[2].replace(/\/\s*$/, ""));
        const path = decodeURIComponent(attrs.get("src") ?? "");
        const data = files.get(path);
        const ext = /\.(png|jpe?g|gif|webp)$/i.exec(path)?.[1]?.toLowerCase();
        if (!data || !ext)
            throw new Error("Missing or unsupported original image in Google Docs HTML export: " + path);
        return { data, ext: ext === "jpg" ? "jpeg" : ext, alt: attrs.get("alt"), style: attrs.get("style") ?? "",
            frame: parseAttributes(match[1] ?? "").get("style") ?? "" };
    });
}
const embeddedImage = /data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+=*/;
const imageDefinition = new RegExp("^\\[(image\\d+)\\]:[ \\t]*<?(" + embeddedImage.source + ")>?[ \\t]*\\r?$", "gm");
const imageUse = new RegExp("!\\[((?:\\\\.|[^\\]\\\\\\n])*)\\](?:\\[(image\\d+)\\]|\\(<?(" + embeddedImage.source + ")>?\\))", "g");
// Only copy numeric layout from Google's HTML, never arbitrary HTML or CSS.
function imageLayout(style) {
    return style.split(";").map(part => part.trim()).filter(part => /^(?:width|height|margin-top|margin-left): *-?\d+(?:\.\d+)?px$/.test(part) ||
        /^transform: *rotate\(-?\d+(?:\.\d+)?rad\) translateZ\(0px\)$/.test(part));
}
async function docImages(markdown, archive) {
    if (!markdown.includes("data:image/"))
        return markdown;
    // Ignore Markdown examples, including reference definitions inside fences.
    const sections = docBlocks(markdown).flatMap(block => {
        if (/^ {0,3}(?:`{3,}|~{3,})/.test(block))
            return [{ literal: true, text: block }];
        const parts = [];
        let from = 0;
        for (const code of block.matchAll(/(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g)) {
            parts.push({ literal: false, text: block.slice(from, code.index) }, { literal: true, text: code[0] });
            from = code.index + code[0].length;
        }
        parts.push({ literal: false, text: block.slice(from) });
        return parts;
    });
    const active = sections.filter(s => !s.literal);
    const defs = new Set(active.flatMap(s => [...s.text.matchAll(imageDefinition)].map(m => m[1])));
    const count = active.reduce((sum, s) => sum + [...s.text.matchAll(imageUse)].filter(m => !m[2] || defs.has(m[2])).length, 0);
    if (!count)
        return markdown;
    const images = googleDocOriginalImages(await archive());
    if (images.length !== count)
        throw new Error("Image count differs between Google Docs Markdown and HTML exports; kept local copy.");
    let index = 0;
    const used = new Set();
    for (const section of active)
        section.text = section.text.replace(imageUse, (match, alt, label) => {
            if (label && !defs.has(label))
                return match;
            if (label)
                used.add(label);
            const { data, ext, style, frame, alt: htmlAlt } = images[index++];
            const labelText = markdownEntities(alt.replace(/\\([^\w\s])/g, "$1"));
            if (labelText && htmlAlt && labelText !== htmlAlt)
                throw new Error("Image descriptions differ between Google Docs Markdown and HTML exports; kept local copy.");
            const escaped = labelText.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;");
            const layout = imageLayout(style), outer = imageLayout(frame);
            // Readers that strip CSS can still honor the ordinary HTML dimensions.
            const size = layout.flatMap(part => {
                const m = /^(width|height): *(\d+(?:\.\d+)?)px$/.exec(part);
                return m ? [` ${m[1]}="${Math.round(Number(m[2]))}"`] : [];
            }).join("");
            const img = '<img alt="' + escaped + '"' + size + (layout.length ? ' style="' + layout.join("; ") + '"' : "") + ' src="data:image/' + ext + ";base64," + Buffer.from(data).toString("base64") + '">';
            return outer.length ? '<span style="display: inline-block; overflow: hidden; ' + outer.join("; ") + '">' + img + '</span>' : img;
        });
    // Leave definitions used by ordinary Markdown links in place.
    const body = active.map(s => s.text.replace(imageDefinition, "")).join("");
    for (const section of active)
        section.text = section.text.replace(imageDefinition, (line, label) => used.has(label) && !body.includes("[" + label + "]") ? "" : line);
    return sections.map(s => s.text).join("");
}
function zipText(files, name) {
    const bytes = files.get(name);
    if (bytes === undefined)
        throw new Error(`PPTX missing ${name}`);
    return new TextDecoder().decode(bytes);
}
function relationshipTargets(xml) {
    const relationships = new Map();
    for (const relationship of xmlDescendants(parseXml(xml), "Relationship"))
        relationships.set(xmlAttribute(relationship, "Id"), xmlAttribute(relationship, "Target"));
    return relationships;
}
function resolvePartPath(basePath, target) {
    const parts = basePath.split("/");
    parts.pop();
    for (const segment of target.split("/")) {
        if (segment === "..")
            parts.pop();
        else if (segment !== ".")
            parts.push(segment);
    }
    return parts.join("/");
}
function slidePartPaths(files) {
    const presentation = parseXml(zipText(files, "ppt/presentation.xml"));
    const relationships = relationshipTargets(zipText(files, "ppt/_rels/presentation.xml.rels"));
    const slides = xmlDescendants(presentation, "p:sldId");
    if (slides.length === 0)
        throw new Error("PPTX presentation has no slides");
    return slides.map((slide) => {
        const id = xmlAttribute(slide, "r:id");
        const target = relationships.get(id);
        if (target === undefined)
            throw new Error(`PPTX presentation missing slide relationship ${id}`);
        return resolvePartPath("ppt/presentation.xml", target);
    });
}
function slideRelationshipsPath(slidePath) {
    const parts = slidePath.split("/");
    const filename = parts.pop();
    if (filename === undefined)
        throw new Error("PPTX slide path is invalid");
    parts.push("_rels", `${filename}.rels`);
    return parts.join("/");
}
function markdownSpan(value, left, right) {
    const leading = /^[ \t]*/.exec(value)[0];
    const trailing = /[ \t]*$/.exec(value)[0];
    const core = value.slice(leading.length, value.length - trailing.length);
    return core === "" ? value : `${leading}${left}${core}${right}${trailing}`;
}
function linkMarkdown(value, target) {
    const leading = /^[ \t]*/.exec(value)[0];
    const trailing = /[ \t]*$/.exec(value)[0];
    const core = value.slice(leading.length, value.length - trailing.length);
    return core === "" ? value : `${leading}[${core.replace(/[[\]\\]/g, "\\$&")}](${target.replace(/\)/g, "%29")})${trailing}`;
}
function formattedRunMarkdown(run, relationships) {
    const text = xmlDescendants(run, "a:t").map(xmlText).join("");
    const runProperties = xmlChildren(run, "a:rPr")[0];
    if (runProperties === undefined)
        return text;
    const hyperlink = xmlDescendants(runProperties, "a:hlinkClick")[0];
    let markdown = text;
    if (runProperties.attributes.get("u") !== undefined && runProperties.attributes.get("u") !== "none" && hyperlink === undefined)
        markdown = markdownSpan(markdown, "<u>", "</u>");
    if (runProperties.attributes.get("strike") !== undefined && runProperties.attributes.get("strike") !== "noStrike")
        markdown = markdownSpan(markdown, "~~", "~~");
    if (runProperties.attributes.get("b") === "1" && runProperties.attributes.get("i") === "1")
        markdown = markdownSpan(markdown, "***", "***");
    else if (runProperties.attributes.get("b") === "1")
        markdown = markdownSpan(markdown, "**", "**");
    else if (runProperties.attributes.get("i") === "1")
        markdown = markdownSpan(markdown, "_", "_");
    if (hyperlink !== undefined) {
        const id = xmlAttribute(hyperlink, "r:id");
        const target = relationships.get(id);
        if (target === undefined)
            throw new Error(`PPTX slide missing hyperlink relationship ${id}`);
        markdown = linkMarkdown(markdown, target);
    }
    return markdown;
}
function paragraphMarkdown(paragraph, relationships) {
    const pPr = xmlChildren(paragraph, "a:pPr")[0];
    const list = pPr === undefined || xmlChildren(pPr, "a:buNone").length !== 0 ? null : xmlChildren(pPr, "a:buAutoNum").length !== 0 ? "number" : xmlChildren(pPr, "a:buChar").length !== 0 ? "bullet" : null;
    const levelValue = pPr === undefined ? undefined : pPr.attributes.get("lvl");
    const level = levelValue === undefined ? 0 : Number(levelValue);
    const pieces = [];
    for (const child of paragraph.children.filter(isXmlNode)) {
        if (child.name === "a:br")
            pieces.push("\n");
        if (child.name === "a:r" || child.name === "a:fld")
            pieces.push(formattedRunMarkdown(child, relationships));
    }
    return Object.freeze({ text: pieces.join("").replace(/[ \t]+$/gm, ""), list, level });
}
function slideMarkdown(slide, relationships) {
    const paragraphs = xmlDescendants(slide, "a:p").map((paragraph) => paragraphMarkdown(paragraph, relationships)).filter((paragraph) => paragraph.text.trim() !== "");
    const lines = paragraphs.map((paragraph, index) => {
        if (index === 0 && paragraph.list === null)
            return `## ${paragraph.text.trim()}`;
        if (paragraph.list === "bullet")
            return `${"  ".repeat(paragraph.level)}- ${paragraph.text.trim()}`;
        if (paragraph.list === "number")
            return `${"  ".repeat(paragraph.level)}1. ${paragraph.text.trim()}`;
        return paragraph.text.trim();
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
function slidesMarkdown(bytes) {
    const files = unzipFiles(bytes);
    const slides = slidePartPaths(files).map((slidePath) => {
        const slide = parseXml(zipText(files, slidePath));
        const relationships = relationshipTargets(zipText(files, slideRelationshipsPath(slidePath)));
        return slideMarkdown(slide, relationships);
    });
    return `${slides.join("\n\n---\n\n")}\n`;
}
function urlParam(url, name) {
    const query = url.searchParams.get(name);
    const hash = new URLSearchParams(url.hash.slice(1)).get(name);
    return query !== null && query !== "" ? query : hash !== null && hash !== "" ? hash : null;
}
function sheetSession(html) {
    const tokenMatch = /"info_params":\{"token":"([^"]+)"/.exec(html);
    if (tokenMatch === null)
        throw cookieAuthenticationError();
    const token = tokenMatch[1];
    const start = html.indexOf("var bootstrapData = ");
    const end = html.indexOf("; function loadWaffle()", start);
    if (start === -1 || end === -1)
        throw new Error("Google Sheets editor did not include save metadata");
    const bootstrap = JSON.parse(html.slice(start + "var bootstrapData = ".length, end));
    const changesValue = bootstrap["changes"];
    if (changesValue === undefined)
        throw new Error("Google Sheets editor did not include save metadata");
    const changes = objectValue(changesValue);
    const revision = changes["revision"];
    const sid = changes["sid"];
    const gridId = bootstrap["gridId"];
    if (typeof revision !== "number" || typeof sid !== "string" || typeof gridId !== "number")
        throw new Error("Google Sheets editor did not include save metadata");
    return Object.freeze({ token, revision, sid, gridId: String(gridId) });
}
function changedCells(baseRows, localRows) {
    const rowCount = Math.max(baseRows.length, localRows.length);
    const cells = [];
    for (let row = 0; row < rowCount; row += 1) {
        const baseRow = baseRows[row] ?? [];
        const localRow = localRows[row] ?? [];
        const columnCount = Math.max(baseRow.length, localRow.length);
        for (let column = 0; column < columnCount; column += 1) {
            const value = localRow[column] ?? "";
            if ((baseRow[column] ?? "") !== value)
                cells.push(Object.freeze({ row, column, value }));
        }
    }
    return cells;
}
function sheetCellCommand(gridId, row, column, value) {
    return [21299578, JSON.stringify([[gridId, row, row + 1, column, column + 1], [132274236, 3, [2, value], null, null, 0], [null, [[null, 513, [0], null, null, null, null, null, null, null, null, 0]]]])];
}
function formulaLikeCell(value) {
    return value.startsWith("=") || value.startsWith("+") || value.startsWith("@") || /^-(?!\d+(?:\.\d+)?$)/.test(value);
}
async function uploadSheetRows(runtime, documentId, gid, key, cells) {
    const session = sheetSession(await googleText(runtime, sheetEditUrl(documentId, gid, key), "Sheets editor"));
    const bundles = [{ commands: cells.map((cell) => sheetCellCommand(session.gridId, cell.row, cell.column, cell.value)), sid: session.sid, reqId: 0 }];
    const body = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify(bundles) });
    const response = await runtime.http.request(`https://docs.google.com/spreadsheets/u/0/d/${encodeURIComponent(documentId)}/save?id=${encodeURIComponent(documentId)}&token=${encodeURIComponent(session.token)}`, { method: "POST", headers: { Cookie: await cookieHeader(runtime), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: body.toString() });
    if (response.status === 401 || response.status === 403)
        throw cookieAuthenticationError();
    if (!response.ok)
        throw new Error(`Google Sheets save failed: HTTP ${response.status}`);
    const text = await response.text();
    const result = saveResult(text, "Sheets");
    if (result["revisionRanges"] === undefined)
        throw new Error("Google Sheets save failed: missing revision ranges");
}
function markdownDocTable(value) {
    const lines = value.trimEnd().split(/\r?\n/);
    const separator = lines.findIndex((line) => markdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell)));
    if (separator === -1)
        return value;
    return `${lines.filter((_line, index) => index !== separator).flatMap((line) => markdownTableRow(line)).join("\n")}\n`;
}
function markdownEntities(value) {
    return value.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" })[entity]);
}
function markdownHtmlTags(value) {
    return value.replace(/<\/?(?:u|sup|sub|mark|span)(?:\s+[^>]*)?>/gi, "");
}
function markdownCombinedEmphasis(value) {
    return value.replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1").replace(/(^|[^\w])___([^_\n]+?)___(?=[^\w]|$)/g, "$1$2").replace(/\*\*_([^_\n]+)_\*\*/g, "$1").replace(/__\*([^*\n]+)\*__/g, "$1").replace(/\*__([^_\n]+)__\*/g, "$1").replace(/_\*\*([^*\n]+)\*\*_/g, "$1");
}
function markdownText(value) {
    return markdownEntities(markdownHtmlTags(markdownCombinedEmphasis(value.replace(/[ \t]{2,}(?=\r?\n|$)/g, "").replace(/(?:^[ \t]*\|.*\|[ \t]*(?:\r?\n|$)){2,}/gm, markdownDocTable).replace(/^```[^\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm, "$1").replace(/^[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]+[^\n]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\r?\n)*/gm, "").replace(/[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*/g, " ").replace(/[ \t]*!\[[^\]\n]*\]\[[^\]\n]*\][ \t]*/g, " ").replace(/\\([\\`*_{}\[\]()#+\-.!|=~])/g, "$1").replace(/^[ \t]*>+[ \t]?/gm, "").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "").replace(/^\[(?: |x|X)\][ \t]+/gm, "").replace(/`([^`\n]+)`/g, "$1").replace(/~~([^~\n]+)~~/g, "$1").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, "$1$2").replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, "$1$2").replace(/^#+ /gm, "").replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1").replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))));
}
// Docs can export a real outer bullet as "> *" while leaving its children
// unquoted. A Markdown quote looks identical, so consult the native paragraphs.
export async function googleDocListMarkdown(markdown, wordExport) {
    if (!/^> (?:\*|\d+\.) /m.test(markdown))
        return markdown;
    const doc = parseXml(zipText(unzipFiles(await wordExport()), "word/document.xml"));
    const outer = new Set(), other = new Set();
    const key = (s) => s.replace(/\s+/g, " ").trim();
    for (const p of xmlDescendants(doc, "w:p")) {
        const props = xmlChildren(p, "w:pPr")[0];
        const numbering = props && xmlChildren(props, "w:numPr")[0];
        const level = numbering && xmlChildren(numbering, "w:ilvl")[0]?.attributes.get("w:val");
        const style = props && xmlChildren(props, "w:pStyle")[0]?.attributes.get("w:val");
        const text = key(xmlDescendants(p, "w:t").map(xmlText).join(""));
        (level === "0" && !/quote/i.test(style ?? "") ? outer : other).add(text);
    }
    let fence = "";
    return markdown.split("\n").map(line => {
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (marker) {
            if (!fence)
                fence = marker[1];
            else if (marker[1].startsWith(fence) && !marker[2].trim())
                fence = "";
            return line;
        }
        if (fence || !/^> (?:\*|\d+\.) /.test(line))
            return line;
        const text = key(markdownText(line));
        return text && outer.has(text) && !other.has(text) ? line.slice(2) : line;
    }).join("\n");
}
async function fetchGoogleDocument(runtime, source, previous, reuseNative, verifyRevision = false) {
    const id = source["document_id"] ?? source.identifier;
    const key = resourceKey(source);
    const gid = source["sheet_gid"];
    const tab = documentTab(source);
    const query = new URLSearchParams();
    if (gid !== undefined || source.type === "presentation") {
        const slide = source.type === "presentation";
        query.set("format", slide ? "pptx" : "csv");
        if (gid != null)
            query.set("gid", gid);
        if (key)
            query.set("resourcekey", key);
        const url = `https://docs.google.com/${slide ? "presentation" : "spreadsheets"}/d/${encodeURIComponent(id)}/export?${query}`;
        if (slide) {
            const { bytes, title } = await googleExportBytes(runtime, url, "Slides PPTX export");
            const markdown = slidesMarkdown(bytes);
            return { title, markdown, data: { document_id: id, title, output_path: null, sheet_gid: null, markdown, rows: null, presentation: true } };
        }
        const { text, title } = await googleExport(runtime, url, "Sheets CSV export");
        const rows = parseCsv(text), markdown = sheetMarkdown(rows);
        return { title, markdown, data: { document_id: id, title, output_path: null, sheet_gid: gid ?? null, markdown, rows } };
    }
    const grant = await nativeDocsGrant(runtime, true);
    const read = async (url) => {
        const response = await googleRead(runtime, url, { headers: { Authorization: "Bearer " + grant.token, ...(key && { "X-Goog-Drive-Resource-Keys": id + "/" + key }) }, redirect: "error" });
        if (!response.ok)
            throw new Error("Google Docs export failed: HTTP " + response.status);
        return response;
    };
    const snapshot = previous === undefined ? {} : objectValue(previous);
    const identityFor = async (md, revision) => {
        if (!grant?.canWrite || !hasDuplicateSlots(md))
            return;
        if (snapshot["position_revision"] === revision && snapshot["document_id"] === id && (snapshot["document_tab"] ?? null) === tab &&
            snapshot["markdown"] === md && duplicateContext(md, md, revision, snapshot["duplicate_identity"]).identity)
            return snapshot["duplicate_identity"];
        const native = await (await read("https://docs.googleapis.com/v1/documents/" + encodeURIComponent(id) + "?includeTabsContent=true&suggestionsViewMode=SUGGESTIONS_INLINE")).json();
        const identity = captureDuplicateIdentity(native, id, revision, tab, md);
        reuseNative?.(native);
        return identity;
    };
    let readRevision, docTitle, legacyImages;
    if (grant && (previous !== undefined || grant.canWrite)) {
        const url = "https://docs.googleapis.com/v1/documents/" + encodeURIComponent(id) + "?fields=documentId,title,revisionId";
        const meta = await (await read(url)).json();
        if (meta.documentId !== id || typeof meta.title !== "string")
            throw new Error("Google Docs export returned unexpected document metadata");
        readRevision = meta.revisionId;
        docTitle = meta.title;
        // Only a successfully verified, revision-controlled batch sets this key.
        // Never use Drive's version, ETag, or modifiedTime as a document revision.
        if (readRevision && snapshot["verified_revision"] === readRevision && snapshot["document_id"] === id && (snapshot["document_tab"] ?? null) === tab && typeof snapshot["markdown"] === "string") {
            if (snapshot["original_images"] === true || !snapshot["markdown"].includes("data:image/")) {
                const identity = await identityFor(snapshot["markdown"], readRevision);
                return { title: docTitle, markdown: snapshot["markdown"], readRevision, data: { ...snapshot, title: docTitle,
                        ...(identity ? { duplicate_identity: identity, position_revision: readRevision } : {}) } };
            }
            // Old verified snapshots embedded Google's display-size thumbnails.
            legacyImages = snapshot["markdown"];
        }
    }
    let title, markdown, archive;
    if (grant?.driveExport && tab === null) {
        // Drive export is unscoped and includes every tab. Never route an explicit
        // tab, including t.0, through this endpoint.
        const url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id);
        if (docTitle !== undefined)
            title = docTitle;
        else {
            const meta = await (await read(url + "?fields=id,name&supportsAllDrives=true")).json();
            if (meta.id !== id || typeof meta.name !== "string")
                throw new Error("Google Docs export returned unexpected Drive file metadata");
            title = meta.name;
        }
        const format = (mime) => read(url + "/export?" + new URLSearchParams({ mimeType: mime }));
        archive = async () => new Uint8Array(await (await format("application/zip")).arrayBuffer());
        const text = await (await format("text/markdown")).text();
        markdown = await googleDocListMarkdown(text, async () => new Uint8Array(await (await format("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).arrayBuffer()));
    }
    else {
        query.set("format", "md");
        if (key)
            query.set("resourcekey", key);
        if (tab)
            query.set("tab", tab);
        const url = `https://docs.google.com/document/d/${encodeURIComponent(id)}/export?${query}`;
        const exp = await googleExport(runtime, url, "Docs Markdown export", grant?.token ?? null);
        archive = async () => {
            const zipped = new URL(url);
            zipped.searchParams.set("format", "zip");
            return (await googleExportBytes(runtime, zipped.toString(), "Docs HTML archive", grant?.token ?? null)).bytes;
        };
        title = exp.title;
        markdown = await googleDocListMarkdown(exp.text, async () => {
            const word = new URL(url);
            word.searchParams.set("format", "docx");
            return (await googleExportBytes(runtime, word.toString(), "Docs Word export", grant?.token ?? null)).bytes;
        });
    }
    // Bind the Markdown and original images to one revision before using them as a sync base.
    const exported = markdown;
    markdown = await docImages(markdown, archive);
    if ((verifyRevision || markdown !== exported) && readRevision) {
        const end = await (await read("https://docs.googleapis.com/v1/documents/" + encodeURIComponent(id) + "?fields=revisionId")).json();
        if (end.revisionId !== readRevision)
            throw new StaleDocRevision(markdown !== exported
                ? "Google Docs changed during image export; local copy preserved. Sync again."
                : "Google Docs changed during Markdown export; local copy preserved. Sync again.");
    }
    // Fetch the native formats only for a newly observed bounded duplicate.
    const duplicateIdentity = readRevision ? await identityFor(markdown, readRevision) : undefined;
    return { title, markdown, ...(readRevision ? { readRevision } : {}), data: { document_id: id, title, output_path: null, sheet_gid: null, markdown, rows: null, ...(duplicateIdentity ? { duplicate_identity: duplicateIdentity, verified_revision: readRevision } : {}), ...(markdown.includes("data:image/") ? { original_images: true } : {}), ...(readRevision ? { position_revision: readRevision } : {}), ...(legacyImages === exported && readRevision ? { verified_revision: readRevision } : {}), ...(tab === null ? {} : { document_tab: tab }) } };
}
async function synchronizeGoogleDocument(runtime, url, source, base, markdown, observeRemote, requireConditionalWrite = false, retryStaleRevision = true) {
    const verifyRevision = observeRemote !== undefined || requireConditionalWrite;
    let nativeDocument;
    const retry = () => synchronizeGoogleDocument(runtime, url, source, base, markdown, observeRemote, requireConditionalWrite, false);
    let remote;
    try {
        remote = await fetchGoogleDocument(runtime, source, base, doc => { nativeDocument = doc; }, verifyRevision);
    }
    catch (error) {
        if (retryStaleRevision && error instanceof StaleDocRevision && verifyRevision)
            return retry();
        throw error;
    }
    await observeRemote?.(remote);
    if (source.type === "presentation") {
        const baseMarkdown = objectValue(base)["markdown"];
        if (typeof baseMarkdown !== "string")
            throw new Error("Google sync base must include markdown");
        if (markdown === baseMarkdown || markdown === remote.markdown)
            return remote;
        if (remote.markdown === baseMarkdown)
            throw new Error("Google Slides sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
        throw new Error("Google Slides changed remotely and locally. Resolve the conflict in Google Slides or the local Markdown file before syncing again.");
    }
    const baseMarkdown = objectValue(base)["markdown"];
    const label = source["sheet_gid"] === undefined ? "Google Docs" : "Google Sheets";
    if (typeof baseMarkdown !== "string")
        throw new Error("Google sync base must include markdown");
    if (source["sheet_gid"] === undefined && (markdown.trimEnd() === baseMarkdown.trimEnd() || markdown.trimEnd() === remote.markdown.trimEnd()))
        return { ...remote, wroteRemote: false };
    if (source["sheet_gid"] !== undefined) {
        const baseObject = objectValue(base);
        if (baseObject["rows"] === undefined) {
            if (markdown === baseMarkdown || markdown === remote.markdown)
                return remote;
            if (remote.markdown !== baseMarkdown)
                throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
        }
        const baseRows = stringRows(baseObject["rows"]);
        const remoteRows = stringRows(objectValue(remote.data)["rows"]);
        const localRows = parseSheetMarkdown(markdown);
        if (rowsEqual(localRows, baseRows) || rowsEqual(localRows, remoteRows))
            return remote;
        if (!rowsEqual(remoteRows, baseRows))
            throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
        const cells = changedCells(baseRows, localRows);
        if (cells.length === 0)
            return remote;
        const formula = cells.find((cell) => formulaLikeCell(cell.value));
        if (formula !== undefined)
            throw new Error(`Google Sheets sync cannot upload formula-like cell text at row ${formula.row + 1}, column ${formula.column + 1}\nPrefix it with an apostrophe or rewrite it as plain text before syncing.`);
        if (requireConditionalWrite)
            throw new Error("Google Sheets cannot condition a save on the revision read. Local draft preserved; apply the edit in Google Sheets.");
        await uploadSheetRows(runtime, source["document_id"] ?? source.identifier, source["sheet_gid"], resourceKey(source), cells);
        const uploaded = await fetchGoogleDocument(runtime, source);
        if (!rowsEqual(stringRows(objectValue(uploaded.data)["rows"]), localRows))
            throw new Error("Google Sheets save verification failed");
        return uploaded;
    }
    if (documentTab(source) === "t.0" && objectValue(base)["document_id"] && !objectValue(base)["document_tab"] && baseMarkdown !== remote.markdown) {
        throw new Error("Google Docs saved snapshot predates explicit tab selection. Keep the local edits and reconcile them with a fresh download of this tab.");
    }
    if (baseMarkdown !== remote.markdown && alreadyAppliedPlainLabelMove(baseMarkdown, markdown, remote.markdown))
        return { ...remote, wroteRemote: false };
    const merged = mergeDocBlocks(baseMarkdown, markdown, remote.markdown, nativeDocMarkdownEqual);
    if (merged === remote.markdown)
        return { ...remote, wroteRemote: false };
    const id = source["document_id"] ?? source.identifier;
    const key = resourceKey(source), tab = documentTab(source);
    const snapshot = objectValue(base);
    // A same-looking paragraph can move (or be recreated) without changing
    // Markdown. Positional lookup needs the actual revision of the local base.
    const sameBase = baseMarkdown === remote.markdown || (snapshot["verified_revision"] !== undefined && snapshot["verified_revision"] === objectValue(remote.data)["verified_revision"]);
    const positionRevision = snapshot["document_id"] === id && (snapshot["document_tab"] ?? null) === tab && sameBase
        ? snapshot["position_revision"] ?? snapshot["verified_revision"] : undefined;
    let wroteRemote = false, writtenRevision;
    let native;
    try {
        native = await tryUploadDocBlocks(runtime, id, key, tab, remote.markdown, merged, async (revision) => {
            if (remote.readRevision === revision)
                return remote.markdown;
            if (remote.readRevision || requireConditionalWrite)
                throw new StaleDocRevision("Google Docs changed before writing; sync again.");
            return (await fetchGoogleDocument(runtime, source)).markdown;
        }, revision => { wroteRemote = true; writtenRevision = revision; }, typeof positionRevision === "string" ? positionRevision : undefined, duplicateContext(baseMarkdown, markdown, snapshot["position_revision"], snapshot["document_id"] === id && (snapshot["document_tab"] ?? null) === tab ? snapshot["duplicate_identity"] : undefined), nativeDocument);
    }
    catch (error) {
        // Re-read and merge the original draft; never replay old offsets or an uncertain write.
        if (retryStaleRevision && error instanceof StaleDocRevision)
            return retry();
        throw error;
    }
    if (!native)
        throw new Error("Google Docs uploads require an OAuth token with drive, drive.file, or both documents and drive.readonly scopes. Set GOOGLE_DOCS_TOKEN_FILE or GOOGLE_FORMS_TOKEN_FILE. Browser login supports downloads only.");
    const uploaded = await fetchGoogleDocument(runtime, source, {}, undefined, verifyRevision);
    if (!nativeDocMarkdownEqual(uploaded.markdown, merged))
        throw new Error("Google Docs save verification failed");
    if (writtenRevision && writtenRevision === uploaded.readRevision) {
        return { ...uploaded, wroteRemote, data: { ...objectValue(uploaded.data), verified_revision: writtenRevision } };
    }
    return { ...uploaded, wroteRemote };
}
export const googleDocsService = defineService({
    name: "google-docs",
    matches: (url) => url.hostname === "docs.google.com" && /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
    parse: (url) => {
        const match = /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
        const documentId = match[2];
        const key = urlParam(url, "resourcekey");
        const resource_key = key === null || key === "" ? {} : { resource_key: key };
        if (match[1] === "presentation")
            return Object.freeze({ service: "google-docs", identifier: documentId, type: "presentation", ...resource_key });
        if (match[1] === "spreadsheets") {
            const queryGid = url.searchParams.get("gid");
            const hashGid = new URLSearchParams(url.hash.slice(1)).get("gid");
            const gid = /^\d+$/.test(hashGid ?? "") ? hashGid : /^\d+$/.test(queryGid ?? "") ? queryGid : null;
            return Object.freeze({ service: "google-docs", identifier: `${documentId}#gid=${gid ?? "default"}`, type: "spreadsheet", document_id: documentId, sheet_gid: gid, ...resource_key });
        }
        const tab = urlParam(url, "tab");
        if (tab !== null && tab !== "")
            return Object.freeze({ service: "google-docs", identifier: `${documentId}#tab=${tab}`, type: "document", document_id: documentId, document_tab: tab, ...resource_key });
        return Object.freeze({ service: "google-docs", identifier: documentId, type: "document", ...resource_key });
    },
    fetch: (runtime, _url, source) => fetchGoogleDocument(runtime, source),
    synchronize: (runtime, url, source, base, markdown, _path, observeRemote, requireConditionalWrite) => synchronizeGoogleDocument(runtime, url, source, base, markdown, observeRemote, requireConditionalWrite),
});
//# sourceMappingURL=google-docs.js.map