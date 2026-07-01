import { createHash, randomUUID } from "node:crypto";
import { stableJsonCompact, stableJsonPretty } from "wire-core";
function object(value) { return value; }
function array(value) { return value; }
function text(value) { return value; }
function notionAuthError() { return new Error("notion cookie authentication is missing or expired. Run `wire notion login` once; other commands reuse saved cookies."); }
function richTextText(value) { return value.map((segment) => segment[0]).join(""); }
function titleRichText(value) { return value === "" ? [] : [[value]]; }
function pointer(id, spaceId) { return { table: "block", id, spaceId }; }
function formatBlockId(id) { return id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id; }
function compact(value) { return stableJsonCompact(value); }
function hash(value) { return `sha256:${createHash("sha256").update(compact(value)).digest("hex")}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value) { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function unescapeHtml(value) { return value.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function inlineCode(value) {
    const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
    const ticks = "`".repeat(longest + 1);
    return `${ticks}${value}${ticks}`;
}
function escapeInlineMarkdown(value) {
    return value.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/~/g, "\\~").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function unescapeInlineMarkdown(value) {
    return value.replace(/\\([\\*~[\]()])/g, "$1");
}
function escaped(value, index) {
    let count = 0;
    for (let position = index - 1; position >= 0 && value[position] === "\\"; position -= 1)
        count += 1;
    return count % 2 === 1;
}
function closingDelimiter(value, start, delimiter) {
    for (let index = start; index < value.length; index += 1)
        if (!escaped(value, index) && value.startsWith(delimiter, index))
            return index;
    return -1;
}
function markdownLink(value) {
    if (!value.startsWith("["))
        return null;
    const labelEnd = closingDelimiter(value, 1, "]");
    if (labelEnd === -1 || value[labelEnd + 1] !== "(")
        return null;
    let depth = 0;
    for (let index = labelEnd + 2; index < value.length; index += 1) {
        if (escaped(value, index))
            continue;
        if (value[index] === "(")
            depth += 1;
        else if (value[index] === ")") {
            if (depth === 0)
                return { label: value.slice(1, labelEnd), url: value.slice(labelEnd + 2, index), length: index + 1 };
            depth -= 1;
        }
    }
    return null;
}
function normalizeMarks(marks) {
    return marks.filter((mark) => Array.isArray(mark) && mark.length > 0 && array(mark)[0] !== "m").map((mark) => clone(mark)).sort((left, right) => compact(left).localeCompare(compact(right)));
}
function normalizeRichText(value) {
    const output = [];
    for (const raw of value) {
        const content = text(raw[0]).replace(/\r\n?/g, "\n");
        if (content === "")
            continue;
        const marks = raw.length > 1 ? normalizeMarks(raw[1]) : [];
        if (marks.length > 0 && content.match(/^ +/) !== null)
            output.push([content.match(/^ +/)[0]]);
        const trimmedContent = marks.length === 0 ? content : content.replace(/^ +| +$/g, "");
        const segment = marks.length === 0 ? [trimmedContent] : [trimmedContent, marks];
        if (trimmedContent === "")
            continue;
        const previous = output[output.length - 1];
        if (previous !== undefined && compact(previous[1] ?? []) === compact(segment[1] ?? []))
            previous[0] = `${previous[0]}${trimmedContent}`;
        else
            output.push(segment);
        if (marks.length > 0 && content.match(/ +$/) !== null)
            output.push([content.match(/ +$/)[0]]);
    }
    while (output.length > 0 && text(output[0][0]).trim() === "")
        output.shift();
    while (output.length > 0 && text(output[output.length - 1][0]).trim() === "")
        output.pop();
    if (output.length > 0)
        output[0][0] = text(output[0][0]).replace(/^ +/, "");
    if (output.length > 0)
        output[output.length - 1][0] = text(output[output.length - 1][0]).replace(/ +$/, "");
    return output;
}
function parseInline(value) {
    const segments = [];
    let rest = value;
    const push = (content, marks = []) => { if (content !== "")
        segments.push(marks.length === 0 ? [content] : [content, marks]); };
    const pushMarked = (content, mark) => {
        for (const segment of parseInline(content)) {
            const marks = normalizeMarks([...(segment[1] ?? []), mark]);
            push(segment[0], marks);
        }
    };
    while (rest.length > 0) {
        if (rest.startsWith("\\")) {
            push(rest.length === 1 ? "\\" : rest[1]);
            rest = rest.slice(rest.length === 1 ? 1 : 2);
            continue;
        }
        const link = markdownLink(rest);
        if (link !== null) {
            pushMarked(link.label, ["a", link.url]);
            rest = rest.slice(link.length);
            continue;
        }
        const dateSpan = /^<span data-notion-date="([^"]+)">(.*?)<\/span>/.exec(rest);
        if (dateSpan !== null) {
            pushMarked(dateSpan[2], ["d", JSON.parse(unescapeHtml(dateSpan[1]))]);
            rest = rest.slice(dateSpan[0].length);
            continue;
        }
        const equationSpan = /^<span data-notion-equation="([^"]+)">(.*?)<\/span>/.exec(rest);
        if (equationSpan !== null) {
            pushMarked(equationSpan[2], ["e", unescapeHtml(equationSpan[1])]);
            rest = rest.slice(equationSpan[0].length);
            continue;
        }
        const mentionSpan = /^<span data-notion-mention="([pu])" data-notion-id="([^"]+)"(?: data-notion-space-id="([^"]+)")?>(.*?)<\/span>/.exec(rest);
        if (mentionSpan !== null) {
            pushMarked(mentionSpan[4], mentionSpan[1] === "p" ? ["p", unescapeHtml(mentionSpan[2]), unescapeHtml(mentionSpan[3])] : ["u", unescapeHtml(mentionSpan[2])]);
            rest = rest.slice(mentionSpan[0].length);
            continue;
        }
        if (rest.startsWith("**")) {
            const end = closingDelimiter(rest, 2, "**");
            if (end !== -1) {
                pushMarked(rest.slice(2, end), ["b"]);
                rest = rest.slice(end + 2);
                continue;
            }
        }
        if (rest.startsWith("*")) {
            const end = closingDelimiter(rest, 1, "*");
            if (end !== -1) {
                pushMarked(rest.slice(1, end), ["i"]);
                rest = rest.slice(end + 1);
                continue;
            }
        }
        if (rest.startsWith("~~")) {
            const end = closingDelimiter(rest, 2, "~~");
            if (end !== -1) {
                pushMarked(rest.slice(2, end), ["s"]);
                rest = rest.slice(end + 2);
                continue;
            }
        }
        const patterns = [
            { match: /^`([^`]+)`/, mark: ["c"] },
            { match: /^<u>(.*?)<\/u>/, mark: ["_"] },
            { match: /^<span data-notion-color="([^"]+)">(.*?)<\/span>/, mark: null },
        ];
        let matched = false;
        for (const pattern of patterns) {
            const match = pattern.match.exec(rest);
            if (match === null)
                continue;
            if (pattern.mark !== null) {
                const mark = pattern.mark;
                push(mark[0] === "c" ? match[1] : unescapeInlineMarkdown(match[1]), [pattern.mark]);
            }
            else
                push(unescapeInlineMarkdown(match[2]), [["h", match[1]]]);
            rest = rest.slice(match[0].length);
            matched = true;
            break;
        }
        if (matched)
            continue;
        const next = rest.search(/(\\|\*\*|\*|~~|`|\[|<u>|<span data-notion-(?:color|date|equation|mention)=)/);
        if (next === -1) {
            push(rest);
            rest = "";
        }
        else if (next === 0) {
            push(rest[0]);
            rest = rest.slice(1);
        }
        else {
            push(rest.slice(0, next));
            rest = rest.slice(next);
        }
    }
    return segments;
}
function renderSegment(content, marks) {
    let rendered = marks.some((raw) => raw[0] === "c") ? content : escapeInlineMarkdown(content);
    let link = null;
    for (const raw of marks) {
        const mark = raw;
        if (mark[0] === "c")
            rendered = inlineCode(rendered);
        else if (mark[0] === "s")
            rendered = `~~${rendered}~~`;
        else if (mark[0] === "i")
            rendered = `*${rendered}*`;
        else if (mark[0] === "b")
            rendered = `**${rendered}**`;
        else if (mark[0] === "a")
            link = mark[1];
        else if (mark[0] === "_")
            rendered = `<u>${rendered}</u>`;
        else if (mark[0] === "h")
            rendered = `<span data-notion-color="${escapeHtml(mark[1])}">${rendered}</span>`;
        else if (mark[0] === "e")
            rendered = `<span data-notion-equation="${escapeHtml(mark[1])}">${rendered}</span>`;
        else if (mark[0] === "p" || mark[0] === "u")
            rendered = `<span data-notion-mention="${mark[0]}" data-notion-id="${escapeHtml(mark[1])}"${mark[0] === "p" ? ` data-notion-space-id="${escapeHtml(mark[2])}"` : ""}>${rendered}</span>`;
        else if (mark[0] === "d")
            rendered = `<span data-notion-date="${escapeHtml(compact(mark[1]))}">${rendered}</span>`;
    }
    return link === null ? rendered : `[${rendered}](${link})`;
}
function renderRichText(value) {
    return normalizeRichText(value).map((segment) => renderSegment(text(segment[0]), segment[1] ?? [])).join("");
}
function renderUserMentions(markdownText, mentions) {
    let output = markdownText;
    for (const [userId, handle] of Object.entries(mentions)) {
        output = output.replace(new RegExp(`<span data-notion-mention="u" data-notion-id="${escapeRegExp(escapeHtml(userId))}">(.*?)</span>`, "g"), (_match, content) => content.replaceAll("‣", `@${handle}`));
    }
    return output;
}
function hydrateUserMentions(markdownText, mentions) {
    let output = markdownText;
    for (const [userId, handle] of Object.entries(mentions)) {
        output = output.replace(new RegExp(`(?<![A-Za-z0-9_])@${escapeRegExp(handle)}(?![A-Za-z0-9_])`, "g"), `<span data-notion-mention="u" data-notion-id="${escapeHtml(userId)}">‣</span>`);
    }
    return output;
}
function baseUserMentions(base) {
    return base["user_mentions"];
}
function notionData(pageId, markdown, tree, mentions) {
    return mentions === undefined ? { page_id: pageId, markdown, blocks: sidecarBlocksFromNotionTree(tree) } : { page_id: pageId, markdown, blocks: sidecarBlocksFromNotionTree(tree), user_mentions: mentions };
}
function lineIndent(line) { return Math.floor(line.match(/^ */)[0].length / 2); }
function stripIndent(line) { return line.replace(/^ +/, ""); }
function tableCellText(value) {
    return value.trim().replace(/(^|[^\\])<br>/g, "$1\n").replace(/\\<br>/g, "<br>");
}
function tableCells(line) {
    const raw = line.replace(/^\||\|$/g, "");
    const cells = [];
    let current = "";
    for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];
        if (character === "\\" && index + 1 < raw.length && ["\\", "|"].includes(raw[index + 1])) {
            current += raw[index + 1];
            index += 1;
        }
        else if (character === "|") {
            cells.push(tableCellText(current));
            current = "";
        }
        else {
            current += character;
        }
    }
    cells.push(tableCellText(current));
    return cells;
}
function isTableSeparator(row) {
    return row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}
function markdownBlockStart(stripped) {
    return /^(#{1,6})\s+|^[-*]\s+|^\d+\.\s+|^-\s+\[[ xX]\]\s+|^```|^---$|^!\[|^>|^\||^:::/.test(stripped);
}
function colonFenceBody(lines, index) {
    const body = [];
    let depth = 0;
    while (true) {
        const stripped = stripIndent(lines[index]);
        if (stripped === ":::") {
            if (depth === 0)
                return { body, index: index + 1 };
            depth -= 1;
        }
        else if (stripped.startsWith(":::") && !stripped.startsWith(":::checked ") && !stripped.startsWith(":::format "))
            depth += 1;
        body.push(lines[index]);
        index += 1;
    }
}
function listContinuation(lines, index, baseIndent, indent, firstLine) {
    const content = [firstLine];
    while (index < lines.length && lines[index].trim() !== "" && baseIndent + lineIndent(lines[index]) === indent + 1 && !markdownBlockStart(stripIndent(lines[index]))) {
        content.push(stripIndent(lines[index]));
        index += 1;
    }
    return { content: content.join("\n"), index };
}
function parseLines(lines, baseIndent = 0) {
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === "") {
            index += 1;
            continue;
        }
        const indent = baseIndent + lineIndent(line);
        const stripped = stripIndent(line);
        const heading = /^(#{1,6})\s+(.+?)(?:\s+\{toggle\})?$/.exec(stripped);
        if (heading !== null) {
            if (heading[1].length > 3)
                throw new Error("lossless Markdown headings deeper than level 3 are not supported");
            const type = ["header", "sub_header", "sub_sub_header"][heading[1].length - 1];
            const properties = stripped.endsWith("{toggle}") ? { format: { toggleable: true } } : {};
            blocks.push({ type, content: heading[2].replace(/\s+\{toggle\}$/, ""), properties, rich_text: parseInline(heading[2].replace(/\s+\{toggle\}$/, "")), indent });
            index += 1;
            continue;
        }
        const list = /^([-*])\s+(.+)$/.exec(stripped);
        const numbered = /^\d+\.\s+(.+)$/.exec(stripped);
        const todo = /^-\s+\[([ xX])\]\s+(.+)$/.exec(stripped);
        if (todo !== null) {
            index += 1;
            const continued = listContinuation(lines, index, baseIndent, indent, todo[2]);
            index = continued.index;
            blocks.push({ type: "to_do", content: continued.content, properties: { checked: todo[1].toLowerCase() === "x" }, rich_text: parseInline(continued.content), indent });
            continue;
        }
        if (list !== null) {
            index += 1;
            const continued = listContinuation(lines, index, baseIndent, indent, list[2]);
            index = continued.index;
            blocks.push({ type: "bulleted_list", content: continued.content, properties: {}, rich_text: parseInline(continued.content), indent });
            continue;
        }
        if (numbered !== null) {
            index += 1;
            const continued = listContinuation(lines, index, baseIndent, indent, numbered[1]);
            index = continued.index;
            blocks.push({ type: "numbered_list", content: continued.content, properties: {}, rich_text: parseInline(continued.content), indent });
            continue;
        }
        if (stripped === "---") {
            blocks.push({ type: "divider", content: "", properties: {}, rich_text: [], indent });
            index += 1;
            continue;
        }
        const image = stripped.startsWith("![") ? markdownLink(stripped.slice(1)) : null;
        if (image !== null && image.length + 1 === stripped.length) {
            blocks.push({ type: "image", content: "", properties: { alt_text: unescapeInlineMarkdown(image.label), source: decodeURI(image.url) }, rich_text: [], indent });
            index += 1;
            continue;
        }
        const codeFence = /^(`{3,})(.*)$/.exec(stripped);
        if (codeFence !== null) {
            const fence = codeFence[1];
            const fenceIndent = line.match(/^ */)[0].length;
            const language = codeFence[2].trim();
            const body = [];
            index += 1;
            while (index < lines.length && !stripIndent(lines[index]).startsWith(fence)) {
                body.push(lines[index].slice(fenceIndent));
                index += 1;
            }
            index += 1;
            blocks.push({ type: "code", content: body.join("\n"), properties: { language: language === "" ? "Plain Text" : language }, rich_text: [], indent });
            continue;
        }
        if (stripped.startsWith("> ")) {
            blocks.push({ type: "quote", content: stripped.slice(2), properties: {}, rich_text: parseInline(stripped.slice(2)), indent });
            index += 1;
            continue;
        }
        if (stripped.startsWith("|")) {
            const tableLines = [];
            while (index < lines.length && stripIndent(lines[index]).startsWith("|")) {
                tableLines.push(stripIndent(lines[index]));
                index += 1;
            }
            const rows = tableLines.map((row) => tableCells(row)).filter((row) => !isTableSeparator(row));
            const columnIds = rows[0].map((_, column) => `column_${column}`);
            blocks.push({ type: "table", content: "", properties: { column_ids: columnIds, has_header: true, has_row_header: false }, rich_text: [], indent });
            for (const row of rows)
                blocks.push({ type: "table_row", content: "", properties: { cells: Object.fromEntries(columnIds.map((column, columnIndex) => [column, parseInline(row[columnIndex] ?? "")])) }, rich_text: [], indent: indent + 1 });
            continue;
        }
        if (stripped === ":::to-do") {
            index += 1;
            const checked = /^:::checked (true|false)$/.exec(stripIndent(lines[index]));
            blocks.push({ type: "to_do", content: "", properties: { checked: checked[1] === "true" }, rich_text: [], indent });
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body, baseIndent));
            continue;
        }
        if (stripped === ":::callout" || stripped === ":::toggle") {
            const type = stripped.slice(3);
            index += 1;
            const title = stripIndent(lines[index]);
            blocks.push({ type, content: title, properties: {}, rich_text: parseInline(title), indent });
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body, baseIndent));
            continue;
        }
        if (stripped === ":::equation") {
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            const content = fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n");
            blocks.push({ type: "equation", content, properties: {}, rich_text: parseInline(content), indent });
            continue;
        }
        if (stripped === ":::text") {
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            const content = fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n");
            blocks.push({ type: "text", content, properties: {}, rich_text: parseInline(content), indent });
            continue;
        }
        if (stripped === ":::page") {
            index += 1;
            const title = stripIndent(lines[index]);
            blocks.push({ type: "page", content: title, properties: {}, rich_text: parseInline(title), indent });
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body, baseIndent));
            continue;
        }
        if (stripped === ":::columns" || stripped === ":::synced") {
            const type = stripped === ":::columns" ? "column_list" : "transclusion_container";
            index += 1;
            blocks.push({ type, content: "", properties: {}, rich_text: [], indent });
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body, baseIndent));
            continue;
        }
        if (stripped === ":::column") {
            index += 1;
            const properties = {};
            if (index < lines.length && lineIndent(lines[index]) === lineIndent(line) && /^-?\d+(?:\.\d+)?$/.test(stripIndent(lines[index]))) {
                properties["format"] = { column_ratio: Number(stripIndent(lines[index])) };
                index += 1;
            }
            blocks.push({ type: "column", content: "", properties, rich_text: [], indent });
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body, baseIndent));
            continue;
        }
        if (stripped === ":::notion-format") {
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            blocks.push(...parseLines(fenced.body.slice(1), baseIndent));
            continue;
        }
        if (stripped === ":::notion-opaque") {
            index += 1;
            const fenced = colonFenceBody(lines, index);
            index = fenced.index;
            const snapshot = JSON.parse(fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n"));
            blocks.push({ type: snapshot["type"], content: "", properties: { notion_opaque: snapshot }, rich_text: [], indent });
            continue;
        }
        const paragraph = [stripped];
        index += 1;
        while (index < lines.length && lines[index].trim() !== "" && !markdownBlockStart(stripIndent(lines[index]))) {
            paragraph.push(stripIndent(lines[index]));
            index += 1;
        }
        const content = paragraph.join("\n");
        blocks.push({ type: "text", content, properties: {}, rich_text: parseInline(content), indent });
    }
    return blocks;
}
export function parseNotionMarkdown(markdown) {
    return parseLines(markdown.replace(/^\ufeff/, "").split("\n"));
}
function tableRowCells(block, columnOrder) {
    const cells = object(block.properties["cells"]);
    if (columnOrder === undefined)
        return cells;
    const localColumns = Object.keys(cells);
    return Object.fromEntries(columnOrder.map((column, index) => [column, cells[localColumns[index]]]));
}
function parserBlockToNotionBlock(block, id, parentId, parentTable, spaceId, userId, currentTime, columnOrder) {
    const base = { id, type: block.type, space_id: spaceId, parent_id: parentId, parent_table: parentTable, alive: true, created_time: currentTime, created_by_table: "notion_user", created_by_id: userId, last_edited_time: currentTime, last_edited_by_table: "notion_user", last_edited_by_id: userId };
    if (block.properties["notion_opaque"] !== undefined)
        return { ...object(block.properties["notion_opaque"]), ...base };
    if (block.type === "divider")
        return base;
    if (block.type === "toggle")
        return { ...base, type: "text", properties: { title: block.rich_text }, format: { toggleable: true } };
    if (block.type === "code")
        return { ...base, properties: { title: [[block.content]], language: [[block.properties["language"]]] } };
    if (block.type === "to_do")
        return { ...base, properties: { title: block.rich_text, checked: [[block.properties["checked"] === true ? "Yes" : "No"]] } };
    if (block.type === "image")
        return { ...base, properties: { source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], ...(block.properties["caption"] === undefined ? {} : { caption: block.properties["caption"] }) } };
    if (block.type === "table")
        return { ...base, properties: {}, format: { table_block_column_order: block.properties["column_ids"], table_block_column_header: block.properties["has_header"], table_block_row_header: block.properties["has_row_header"] } };
    if (block.type === "table_row")
        return { ...base, properties: tableRowCells(block, columnOrder) };
    if (block.type === "column_list" || block.type === "transclusion_container")
        return { ...base, properties: {} };
    if (block.type === "column")
        return { ...base, properties: {}, ...(block.properties["format"] === undefined ? {} : { format: block.properties["format"] }) };
    if (block.type === "callout")
        return { ...base, properties: { title: block.rich_text }, ...(block.properties["format"] === undefined ? {} : { format: block.properties["format"] }) };
    if (["header", "sub_header", "sub_sub_header"].includes(block.type))
        return { ...base, properties: { title: block.rich_text }, ...(block.properties["format"] === undefined ? {} : { format: block.properties["format"] }) };
    return { ...base, properties: { title: block.rich_text } };
}
export function buildNotionCreateOperations(blocks, pageId, spaceId, userId, currentTime, createId = () => randomUUID(), initialTableColumnOrder) {
    const operations = [];
    const topLevelIds = [];
    const lastAtIndent = new Map();
    const lastChildByParent = new Map();
    let lastTableId = null;
    let tableColumnOrder = initialTableColumnOrder;
    for (const block of blocks) {
        const blockId = formatBlockId(createId().replaceAll("-", ""));
        let parentId = pageId;
        if (block.type === "table_row")
            parentId = lastTableId;
        else if (block.indent > 0) {
            const parent = lastAtIndent.get(block.indent - 1);
            if (parent === undefined)
                throw new Error(`Indented Notion Markdown block has no parent at indent ${block.indent - 1}`);
            parentId = parent;
        }
        if (block.type !== "table_row" && block.indent === 0)
            topLevelIds.push(blockId);
        const parentTable = "block";
        operations.push({ pointer: pointer(blockId, spaceId), path: [], command: "set", args: parserBlockToNotionBlock(block, blockId, parentId, parentTable, spaceId, userId, currentTime, block.type === "table_row" ? tableColumnOrder : undefined) });
        const after = lastChildByParent.get(parentId);
        operations.push({ pointer: pointer(parentId, spaceId), path: ["content"], command: after === undefined ? "listBefore" : "listAfter", args: after === undefined ? { id: blockId } : { id: blockId, after } });
        lastChildByParent.set(parentId, blockId);
        if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type))
            lastAtIndent.set(block.indent, blockId);
        if (block.type === "table") {
            lastTableId = blockId;
            tableColumnOrder = block.properties["column_ids"];
        }
    }
    if (operations.length > 0)
        operations.push({ pointer: pointer(pageId, spaceId), path: ["last_edited_time"], command: "set", args: currentTime });
    return { operations, topLevelIds };
}
function canonicalBlock(value, columnOrder) {
    const type = value["type"];
    if (type === "text" && object(value["format"] ?? {})["toggleable"] === true)
        return { type: "toggle", title: normalizeRichText(object(value["properties"])["title"]) };
    if (type === "code")
        return { type, title: normalizeRichText(object(value["properties"])["title"]), language: object(value["properties"])["language"] };
    if (type === "to_do")
        return { type, title: normalizeRichText(object(value["properties"])["title"]), checked: object(value["properties"])["checked"] ?? [["No"]] };
    if (type === "table")
        return { type, column_count: object(value["format"])["table_block_column_order"].length };
    if (type === "table_row")
        return { type, cells: columnOrder.map((column) => normalizeRichText(object(value["properties"])[column])) };
    if (type === "image")
        return { type, source: object(value["properties"])["source"], alt_text: object(value["properties"])["alt_text"], caption: object(value["properties"])["caption"] ?? null };
    if (["divider", "column_list", "transclusion_container"].includes(type))
        return { type };
    if (type === "column")
        return { type, column_ratio: object(value["format"] ?? {})["column_ratio"] ?? null };
    if (["header", "sub_header", "sub_sub_header"].includes(type))
        return { type, title: normalizeRichText(object(value["properties"] ?? { title: [] })["title"] ?? []), toggleable: object(value["format"] ?? {})["toggleable"] === true };
    return { type, title: normalizeRichText(object(value["properties"] ?? { title: [] })["title"] ?? []) };
}
function canonicalParserBlock(block, columnOrder) {
    if (block.properties["notion_opaque"] !== undefined)
        return canonicalBlock(object(block.properties["notion_opaque"]), columnOrder);
    if (block.type === "header" || block.type === "sub_header" || block.type === "sub_sub_header")
        return { type: block.type, title: normalizeRichText(block.rich_text), toggleable: object(block.properties["format"] ?? {})["toggleable"] === true };
    if (block.type === "text" || block.type === "bulleted_list" || block.type === "numbered_list" || block.type === "quote" || block.type === "callout" || block.type === "toggle")
        return { type: block.type, title: normalizeRichText(block.rich_text) };
    if (block.type === "code")
        return { type: "code", title: normalizeRichText([[block.content]]), language: [[block.properties["language"]]] };
    if (block.type === "to_do")
        return { type: "to_do", title: normalizeRichText(block.rich_text), checked: [[block.properties["checked"] === true ? "Yes" : "No"]] };
    if (block.type === "table")
        return { type: "table", column_count: block.properties["column_ids"].length };
    if (block.type === "table_row") {
        const cells = tableRowCells(block, columnOrder);
        return { type: "table_row", cells: columnOrder.map((column) => normalizeRichText(cells[column])) };
    }
    if (block.type === "image")
        return { type: "image", source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], caption: block.properties["caption"] ?? null };
    if (block.type === "column")
        return { type: "column", column_ratio: object(block.properties["format"] ?? {})["column_ratio"] ?? null };
    if (block.type === "column_list" || block.type === "transclusion_container")
        return { type: block.type };
    return { type: block.type };
}
export function notionBlockContentHash(block, columnOrder) {
    return hash("rich_text" in block ? canonicalParserBlock(block, columnOrder) : canonicalBlock(block, columnOrder));
}
export function sidecarBlocksFromNotionTree(tree) {
    const blocks = [];
    const walk = (node, path, columnOrder) => {
        const type = node.block["type"];
        const nextColumnOrder = type === "table" ? object(node.block["format"])["table_block_column_order"] : columnOrder;
        blocks.push({ id: node.id, path, type, hash: notionBlockContentHash(node.block, columnOrder), snapshot: canonicalBlock(node.block, columnOrder) });
        node.children.forEach((child, index) => walk(child, [...path, index], nextColumnOrder));
    };
    walk(tree, []);
    return blocks;
}
function localTree(blocks) {
    const roots = [];
    const stack = [{ indent: -1, children: roots }];
    for (const block of blocks) {
        const node = { block, children: [] };
        while (stack[stack.length - 1].indent >= block.indent)
            stack.pop();
        stack[stack.length - 1].children.push(node);
        if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type))
            stack.push({ indent: block.indent, children: node.children });
    }
    return roots;
}
function outputNode(node, remoteNode, parentId, remote, currentTime, columnOrder) {
    const id = remoteNode?.id ?? formatBlockId(randomUUID().replaceAll("-", ""));
    const block = parserBlockToNotionBlock(node.block, id, parentId, "block", remote.spaceId, remote.userId, currentTime, node.block.type === "table_row" ? columnOrder : undefined);
    const nextColumnOrder = block["type"] === "table" ? object(block["format"])["table_block_column_order"] : columnOrder;
    return { id, block, children: node.children.map((child, index) => outputNode(child, remoteNode?.children[index], id, remote, currentTime, nextColumnOrder)) };
}
function emitUpdates(remote, local, blockId, spaceId, columnOrder) {
    const operations = [];
    const remoteType = remote["type"] === "text" && object(remote["format"] ?? {})["toggleable"] === true ? "toggle" : remote["type"];
    const localType = local.type === "toggle" ? "text" : local.type;
    const typeChanged = remoteType !== local.type;
    if (typeChanged)
        operations.push({ pointer: pointer(blockId, spaceId), path: ["type"], command: "set", args: localType });
    const args = parserBlockToNotionBlock(local, blockId, remote["parent_id"] ?? "", "block", spaceId, "", 0, local.type === "table_row" ? columnOrder : undefined);
    const remoteProperties = object(remote["properties"] ?? {});
    const nextProperties = object(args["properties"] ?? {});
    if (typeChanged) {
        if (compact(remoteProperties) !== compact(nextProperties))
            operations.push({ pointer: pointer(blockId, spaceId), path: ["properties"], command: "set", args: nextProperties });
    }
    else {
        for (const key of Object.keys(nextProperties))
            if (compact(remoteProperties[key] ?? null) !== compact(nextProperties[key]))
                operations.push({ pointer: pointer(blockId, spaceId), path: ["properties", key], command: "set", args: nextProperties[key] });
    }
    const nextFormat = object(args["format"] ?? {});
    if ((typeChanged || args["format"] !== undefined || remote["format"] !== undefined) && compact(remote["format"] ?? {}) !== compact(nextFormat))
        operations.push({ pointer: pointer(blockId, spaceId), path: ["format"], command: "set", args: nextFormat });
    return operations;
}
function flattenLocalSubtree(node) {
    const blocks = [];
    const walk = (value, indent) => {
        blocks.push({ ...value.block, indent });
        for (const child of value.children)
            walk(child, indent + 1);
    };
    walk(node, 0);
    return blocks;
}
function buildNotionCreateSubtreeOperations(node, parentId, ambient, columnOrder) {
    return buildNotionCreateOperations(flattenLocalSubtree(node), parentId, ambient.spaceId, ambient.userId, ambient.currentTime, undefined, columnOrder);
}
function positionRootCreateOperations(operations, parentId, spaceId, previousId) {
    return operations.map((operation) => {
        if (operation.pointer["id"] === parentId && operation.pointer["spaceId"] === spaceId && operation.path.length === 1 && operation.path[0] === "content")
            return { ...operation, command: previousId === undefined ? "listBefore" : "listAfter", args: previousId === undefined ? { id: object(operation.args)["id"] } : { id: object(operation.args)["id"], after: previousId } };
        return operation;
    });
}
function localSubtreeSize(node) {
    return 1 + node.children.reduce((total, child) => total + localSubtreeSize(child), 0);
}
function remoteSubtreeSize(node) {
    return 1 + node.children.reduce((total, child) => total + remoteSubtreeSize(child), 0);
}
function deleteRemoteSubtreeOperations(node, parentId, spaceId) {
    return [
        ...node.children.flatMap((child) => deleteRemoteSubtreeOperations(child, node.id, spaceId)),
        { pointer: pointer(node.id, spaceId), path: ["alive"], command: "set", args: false },
        { pointer: pointer(parentId, spaceId), path: ["content"], command: "listRemove", args: { id: node.id } },
    ];
}
function diffNotionChildLists(remoteParent, localChildren, ambient, summary, columnOrder) {
    const operations = [];
    const remoteChildren = [...remoteParent.children];
    const nextColumnOrder = remoteParent.block["type"] === "table" ? object(remoteParent.block["format"])["table_block_column_order"] : columnOrder;
    const remoteHash = (index) => notionBlockContentHash(remoteChildren[index].block, nextColumnOrder);
    const localHash = (index) => notionBlockContentHash(localChildren[index].block, nextColumnOrder);
    let remoteIndex = 0;
    let localIndex = 0;
    let previousId;
    while (remoteIndex < remoteChildren.length && localIndex < localChildren.length) {
        const remoteNode = remoteChildren[remoteIndex];
        const localNode = localChildren[localIndex];
        if (remoteHash(remoteIndex) === localHash(localIndex)) {
            operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder));
            previousId = remoteNode.id;
            remoteIndex += 1;
            localIndex += 1;
            continue;
        }
        const remoteNodeAppearsLaterLocally = localChildren.some((child, index) => index > localIndex && notionBlockContentHash(child.block, nextColumnOrder) === remoteHash(remoteIndex));
        const movedRemoteIndex = remoteNodeAppearsLaterLocally ? remoteChildren.findIndex((child, index) => index > remoteIndex && notionBlockContentHash(child.block, nextColumnOrder) === localHash(localIndex)) : -1;
        if (movedRemoteIndex !== -1) {
            const moved = remoteChildren[movedRemoteIndex];
            operations.push({ pointer: pointer(remoteParent.id, ambient.spaceId), path: ["content"], command: previousId === undefined ? "listBefore" : "listAfter", args: previousId === undefined ? { id: moved.id } : { id: moved.id, after: previousId } });
            remoteChildren.splice(movedRemoteIndex, 1);
            remoteChildren.splice(remoteIndex, 0, moved);
            summary.moved += 1;
            continue;
        }
        if (localIndex + 1 < localChildren.length && remoteHash(remoteIndex) === localHash(localIndex + 1)) {
            const built = buildNotionCreateSubtreeOperations(localNode, remoteParent.id, ambient, nextColumnOrder);
            operations.push(...positionRootCreateOperations(built.operations, remoteParent.id, ambient.spaceId, previousId));
            summary.inserted += localSubtreeSize(localNode);
            previousId = built.topLevelIds[0];
            localIndex += 1;
            continue;
        }
        if (remoteIndex + 1 < remoteChildren.length && remoteHash(remoteIndex + 1) === localHash(localIndex)) {
            operations.push(...deleteRemoteSubtreeOperations(remoteNode, remoteParent.id, ambient.spaceId));
            summary.deleted += remoteSubtreeSize(remoteNode);
            remoteIndex += 1;
            continue;
        }
        const before = operations.length;
        operations.push(...emitUpdates(remoteNode.block, localNode.block, remoteNode.id, ambient.spaceId, nextColumnOrder));
        operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder));
        if (operations.length > before)
            summary.updated += 1;
        previousId = remoteNode.id;
        remoteIndex += 1;
        localIndex += 1;
    }
    while (localIndex < localChildren.length) {
        const localNode = localChildren[localIndex];
        const built = buildNotionCreateSubtreeOperations(localNode, remoteParent.id, ambient, nextColumnOrder);
        operations.push(...positionRootCreateOperations(built.operations, remoteParent.id, ambient.spaceId, previousId ?? remoteChildren[remoteChildren.length - 1]?.id));
        summary.inserted += localSubtreeSize(localNode);
        previousId = built.topLevelIds[0];
        localIndex += 1;
    }
    while (remoteIndex < remoteChildren.length) {
        const child = remoteChildren[remoteIndex];
        operations.push(...deleteRemoteSubtreeOperations(child, remoteParent.id, ambient.spaceId));
        summary.deleted += remoteSubtreeSize(child);
        remoteIndex += 1;
    }
    return operations;
}
export function diffNotionBlockTrees(remoteTree, localBlocks, _sidecarBlocks, ambient) {
    const summary = { inserted: 0, updated: 0, deleted: 0, moved: 0 };
    const locals = localTree(localBlocks);
    const operations = diffNotionChildLists(remoteTree, locals, ambient, summary);
    if (operations.length > 0 && !operations.some((operation) => operation.path.length === 1 && operation.path[0] === "last_edited_time"))
        operations.push({ pointer: pointer(remoteTree.id, ambient.spaceId), path: ["last_edited_time"], command: "set", args: ambient.currentTime });
    return { operations, summary };
}
function renderNode(tree, indent, parentType = "") {
    const prefix = "  ".repeat(indent);
    const type = tree.block["type"] === "text" && object(tree.block["format"] ?? {})["toggleable"] === true ? "toggle" : tree.block["type"];
    const properties = object(tree.block["properties"] ?? {});
    const title = properties["title"] === undefined ? "" : renderRichText(properties["title"]);
    const format = object(tree.block["format"] ?? {});
    if (["header", "sub_header", "sub_sub_header"].includes(type)) {
        const marker = type === "header" ? "#" : type === "sub_header" ? "##" : "###";
        return [`${prefix}${marker} ${title}${format["toggleable"] === true ? " {toggle}" : ""}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
    }
    if (type === "bulleted_list") {
        const lines = title.split("\n");
        return [`${prefix}- ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}  ${line}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
    }
    if (type === "numbered_list") {
        const lines = title.split("\n");
        return [`${prefix}1. ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}   ${line}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
    }
    if (type === "to_do") {
        const checked = richTextText(properties["checked"] ?? [["No"]]) === "Yes";
        if (title === "")
            return [`${prefix}:::to-do`, `${prefix}:::checked ${JSON.stringify(checked)}`, prefix, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
        const lines = title.split("\n");
        return [`${prefix}- [${checked ? "x" : " "}] ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}  ${line}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
    }
    if (type === "quote")
        return [`${prefix}> ${title}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
    if (type === "divider")
        return [`${prefix}---`];
    if (type === "code") {
        const code = richTextText(properties["title"]);
        const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
        const fence = "`".repeat(Math.max(3, longest + 1));
        const language = richTextText(properties["language"]).replace("Plain Text", "");
        return [`${prefix}${fence}${language}`, ...code.split("\n").map((line) => `${prefix}${line}`), `${prefix}${fence}`];
    }
    if (type === "image")
        return [`${prefix}![${escapeInlineMarkdown(richTextText(properties["alt_text"]))}](${encodeURI(richTextText(properties["source"]))})`];
    if (type === "equation")
        return [`${prefix}:::equation`, ...title.split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
    if (type === "page")
        return [`${prefix}:::page`, `${prefix}${title}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    if (type === "column_list")
        return [`${prefix}:::columns`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    if (type === "column")
        return [`${prefix}:::column`, ...(format["column_ratio"] === undefined ? [] : [`${prefix}${format["column_ratio"]}`]), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    if (type === "transclusion_container")
        return [`${prefix}:::synced`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    if (type === "callout" || type === "toggle")
        return [`${prefix}:::${type}`, `${prefix}${title}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    if (type === "table") {
        const columns = object(tree.block["format"])["table_block_column_order"];
        const rows = tree.children.map((child) => columns.map((column) => renderRichText(object(child.block["properties"])[column]).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/<br>/g, "\\<br>").replace(/\n/g, "<br>")));
        return rows.flatMap((row, index) => index === 0 ? [`${prefix}| ${row.join(" | ")} |`, `${prefix}| ${columns.map(() => "---").join(" | ")} |`] : [`${prefix}| ${row.join(" | ")} |`]);
    }
    if (type !== "text") {
        const opaque = [`${prefix}:::notion-opaque`, ...stableJsonPretty(tree.block).split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
        if (tree.block["format"] !== undefined)
            return [`${prefix}:::notion-format`, `${prefix}:::format ${compact(tree.block["format"])}`, ...opaque, `${prefix}:::`];
        return opaque;
    }
    if (title === "")
        return [`${prefix}:::text`, `${prefix}:::`];
    if (["bulleted_list", "numbered_list", "to_do"].includes(parentType))
        return [`${prefix}:::text`, ...title.split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
    return [`${prefix}${title}`];
}
export function renderNotionTreeToMarkdown(tree, mentions) {
    const title = renderRichText(object(tree.block["properties"])["title"]);
    const compactTypes = new Set(["bulleted_list", "numbered_list", "to_do"]);
    const body = tree.children.flatMap((child, index) => [
        ...(index === 0 || (tree.children[index - 1].block["type"] === child.block["type"] && compactTypes.has(child.block["type"])) ? [] : [""]),
        ...renderNode(child, 0),
    ]);
    const markdown = [`# ${title}`, ...body.length === 0 ? [] : ["", ...body]].join("\n").trim();
    return mentions === undefined ? markdown : renderUserMentions(markdown, mentions);
}
async function notionPost(runtime, path, cookie, body, headers) {
    const response = await runtime.http.request(`https://www.notion.so/api/v3/${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (!response.ok)
        throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
    return await response.json();
}
async function fetchTree(runtime, url, source) {
    const cookies = await runtime.cookies.loadSaved("notion");
    if (cookies === null)
        throw notionAuthError();
    const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
    const userId = cookies.find((value) => value.name === "notion_user_id").value;
    const csrf = cookies.find((value) => value.name === "csrf")?.value;
    await runtime.http.request(url, { headers: { cookie } });
    const spaces = await notionPost(runtime, "getSpaces", cookie, {}, {});
    const spaceView = object(object(spaces[userId])["space_view"]);
    const spaceId = object(spaceView[Object.keys(spaceView)[0]])["spaceId"];
    const pageId = formatBlockId(source.identifier);
    const headers = { "x-notion-active-user-header": userId, "x-notion-space-id": spaceId, referer: url, ...(csrf === undefined ? {} : { "x-csrf-token": csrf }) };
    const blocks = new Map();
    let stack = [];
    let chunkNumber = 0;
    do {
        const data = await notionPost(runtime, "loadCachedPageChunkV2", cookie, { page: { id: pageId }, limit: 100, cursor: { stack }, chunkNumber, verticalColumns: false }, headers);
        for (const [blockId, wrapper] of Object.entries(object(object(data["recordMap"])["block"])))
            blocks.set(blockId, object(object(object(wrapper)["value"])["value"]));
        const cursors = data["cursors"];
        stack = cursors.length === 0 ? [] : cursors[0]["stack"];
        chunkNumber += 1;
    } while (stack.length > 0);
    while (true) {
        const missing = new Set();
        const pending = [pageId];
        const visited = new Set();
        while (pending.length > 0) {
            const idValue = pending.pop();
            if (visited.has(idValue))
                continue;
            visited.add(idValue);
            const block = blocks.get(idValue);
            if (block === undefined) {
                missing.add(idValue);
                continue;
            }
            if (idValue !== pageId && block["type"] === "page")
                continue;
            for (const child of block["content"] ?? [])
                pending.push(child);
        }
        if (missing.size === 0)
            break;
        const missingIds = [...missing];
        const data = await notionPost(runtime, "getRecordValues", cookie, { requests: missingIds.map((idValue) => ({ table: "block", id: idValue })) }, headers);
        for (const [index, result] of data["results"].entries()) {
            const block = object(result["value"]);
            blocks.set(block["id"] ?? missingIds[index], block);
        }
    }
    const build = (idValue) => {
        const block = blocks.get(idValue);
        if (idValue !== pageId && block["type"] === "page")
            return { id: idValue, block, children: [] };
        return { id: idValue, block, children: (block["content"] ?? []).filter((child) => blocks.get(child)?.["alive"] !== false).map(build) };
    };
    return { tree: build(pageId), userId, spaceId, cookie, headers };
}
export async function fetchNotionDocument(runtime, url, source) {
    const { tree } = await fetchTree(runtime, url, source);
    const markdown = renderNotionTreeToMarkdown(tree);
    return { title: markdown.split("\n")[0].replace(/^# */, ""), markdown, data: notionData(source.identifier, markdown, tree, undefined) };
}
export async function uploadNotionDocument(runtime, markdown, _markdownPath) {
    const split = splitTitle(markdown);
    if (split.title === "")
        throw new Error("Markdown document requires a first heading");
    const cookies = await runtime.cookies.loadSaved("notion");
    if (cookies === null)
        throw notionAuthError();
    const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
    const userId = cookies.find((value) => value.name === "notion_user_id").value;
    const csrf = cookies.find((value) => value.name === "csrf")?.value;
    const spaces = await notionPost(runtime, "getSpaces", cookie, {}, {});
    const spaceView = object(object(spaces[userId])["space_view"]);
    const spaceId = object(spaceView[Object.keys(spaceView)[0]])["spaceId"];
    const pageId = randomUUID();
    const compactPageId = pageId.replaceAll("-", "");
    const currentTime = runtime.clock.now().getTime();
    const headers = { "x-notion-active-user-header": userId, "x-notion-space-id": spaceId, referer: `https://www.notion.so/${compactPageId}`, ...(csrf === undefined ? {} : { "x-csrf-token": csrf }) };
    const pageOperation = {
        pointer: pointer(pageId, spaceId),
        path: [],
        command: "set",
        args: {
            id: pageId,
            type: "page",
            properties: { title: titleRichText(split.title) },
            space_id: spaceId,
            created_time: currentTime,
            created_by_table: "notion_user",
            created_by_id: userId,
            last_edited_time: currentTime,
            last_edited_by_table: "notion_user",
            last_edited_by_id: userId,
            parent_id: spaceId,
            parent_table: "space",
            alive: true,
            permissions: [{ type: "user_permission", role: "editor", user_id: userId }],
        },
    };
    const localBlocks = parseNotionMarkdown(split.body);
    const operations = [pageOperation, ...buildNotionCreateOperations(localBlocks, pageId, spaceId, userId, currentTime).operations];
    await notionPost(runtime, "saveTransactionsFanout", cookie, { requestId: randomUUID(), transactions: [{ id: randomUUID(), spaceId, operations }] }, headers);
    const pageTree = {
        id: pageId,
        block: pageOperation.args,
        children: localTree(localBlocks).map((node) => outputNode(node, undefined, pageId, { spaceId, userId }, currentTime)),
    };
    const output = renderNotionTreeToMarkdown(pageTree);
    return { url: `https://www.notion.so/${compactPageId}`, title: split.title, markdown: output, data: notionData(compactPageId, output, pageTree, undefined) };
}
function splitTitle(markdown) {
    const lines = markdown.replace(/^\ufeff/, "").split("\n");
    const first = lines[0].trimStart();
    if (first === "#")
        return { title: "", body: lines.slice(1).join("\n") };
    if (/^#{1,6}\s+\S/.test(first))
        return { title: first.replace(/^#+\s+/, "").trim(), body: lines.slice(1).join("\n") };
    return { title: "", body: markdown };
}
export async function synchronizeNotionDocument(runtime, url, base, markdown, _markdownPath) {
    const source = { service: "notion", identifier: /([a-f0-9]{32})/.exec(url)[1], type: "document" };
    const remote = await fetchTree(runtime, url, source);
    const baseObject = object(base);
    const mentions = baseUserMentions(baseObject);
    const currentMarkdown = renderNotionTreeToMarkdown(remote.tree, mentions);
    const baseMarkdown = baseObject["markdown"];
    let split = splitTitle(markdown);
    const currentSplit = splitTitle(currentMarkdown);
    const baseSplit = baseMarkdown === undefined ? undefined : splitTitle(baseMarkdown);
    let fieldMerged = false;
    if (baseSplit !== undefined) {
        const localTitleChanged = baseSplit.title !== split.title;
        const remoteTitleChanged = baseSplit.title !== currentSplit.title;
        const localBodyChanged = baseSplit.body !== split.body;
        const remoteBodyChanged = baseSplit.body !== currentSplit.body;
        if ((localTitleChanged || localBodyChanged) && (remoteTitleChanged || remoteBodyChanged)) {
            split = { title: localTitleChanged ? split.title : currentSplit.title, body: localBodyChanged ? split.body : currentSplit.body };
            fieldMerged = true;
        }
    }
    const targetMarkdown = split.title === "" ? split.body : `# ${split.title}\n${split.body}`;
    if (mentions === undefined && split.body === currentSplit.body && (baseSplit === undefined || baseSplit.body === currentSplit.body)) {
        if (baseSplit !== undefined) {
            const localTitleChanged = baseSplit.title !== split.title;
            const remoteTitleChanged = baseSplit.title !== currentSplit.title;
            if (!localTitleChanged && remoteTitleChanged)
                return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
            if (localTitleChanged && remoteTitleChanged && split.title !== currentSplit.title)
                throw new Error("Markdown and Notion changed since last sync");
            if (localTitleChanged && remoteTitleChanged)
                return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
        }
        const titleRich = split.title === "" ? object(remote.tree.block["properties"])["title"] : titleRichText(split.title);
        const titleChanged = split.title !== "" && compact(object(remote.tree.block["properties"])["title"]) !== compact(titleRich);
        if (titleChanged)
            await notionPost(runtime, "saveTransactionsFanout", remote.cookie, { requestId: randomUUID(), transactions: [{ id: randomUUID(), spaceId: remote.spaceId, operations: [{ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "set", args: titleRich }, { pointer: pointer(remote.tree.id, remote.spaceId), path: ["last_edited_time"], command: "set", args: runtime.clock.now().getTime() }] }] }, remote.headers);
        const outputTree = { ...remote.tree, block: { ...remote.tree.block, properties: { ...object(remote.tree.block["properties"]), title: titleRich } } };
        const output = renderNotionTreeToMarkdown(outputTree, mentions);
        return { title: output.split("\n")[0].replace(/^# */, ""), markdown: output, data: notionData(remote.tree.id, output, outputTree, mentions) };
    }
    if (baseMarkdown !== undefined) {
        const localChanged = baseMarkdown !== targetMarkdown;
        const remoteChanged = baseMarkdown !== currentMarkdown;
        if (!localChanged && remoteChanged)
            return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
        if (localChanged && remoteChanged && targetMarkdown !== currentMarkdown && !fieldMerged)
            throw new Error("Markdown and Notion changed since last sync");
        if (localChanged && remoteChanged && targetMarkdown === currentMarkdown)
            return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
    }
    const localBody = mentions === undefined ? split.body : hydrateUserMentions(split.body, mentions);
    const localBlocks = parseNotionMarkdown(localBody);
    const ambient = { spaceId: remote.spaceId, userId: remote.userId, currentTime: runtime.clock.now().getTime() };
    const diffResult = diffNotionBlockTrees(remote.tree, localBlocks, sidecarBlocksFromNotionTree(remote.tree), ambient);
    const operations = [...diffResult.operations];
    const titleRich = split.title === "" ? object(remote.tree.block["properties"])["title"] : titleRichText(split.title);
    if (split.title !== "" && compact(object(remote.tree.block["properties"])["title"]) !== compact(titleRich))
        operations.unshift({ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "set", args: titleRich });
    if (operations.length > 0)
        await notionPost(runtime, "saveTransactionsFanout", remote.cookie, { requestId: randomUUID(), transactions: [{ id: randomUUID(), spaceId: remote.spaceId, operations }] }, remote.headers);
    const outputTree = { id: remote.tree.id, block: { ...remote.tree.block, properties: { ...object(remote.tree.block["properties"]), title: titleRich } }, children: localTree(localBlocks).map((node, index) => outputNode(node, remote.tree.children[index], remote.tree.id, remote, ambient.currentTime)) };
    const output = renderNotionTreeToMarkdown(outputTree, mentions);
    return { title: output.split("\n")[0].replace(/^# */, ""), markdown: output, data: notionData(remote.tree.id, output, outputTree, mentions) };
}
//# sourceMappingURL=notion-sync.js.map