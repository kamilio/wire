import { createGoogleTokensCapability, googleTokenExpired, parseGoogleToken } from "wire-core";
import { googleRead } from "./google-read.js";
import { docBlocks, docChanges } from "./doc-blocks.js";
function eligible(scopes, requireWrite) {
    const has = (name) => scopes?.includes("https://www.googleapis.com/auth/" + name);
    if (!requireWrite && (has("documents.readonly") || has("documents") || has("drive.readonly")))
        return true;
    return !!(has("drive") || has("drive.file") || (has("documents") && has("drive.readonly")));
}
export async function nativeDocsToken(runtime, readOnly = false) {
    const optional = (key) => runtime.configuration.getOptional?.(key);
    for (const requireWrite of readOnly ? [true, false] : [true])
        for (const name of ["GOOGLE_DOCS_TOKEN_FILE", "GOOGLE_FORMS_TOKEN_FILE"]) {
            const path = optional(name);
            if (!path || !await runtime.filesystem.exists(path))
                continue;
            let grant = parseGoogleToken(await runtime.filesystem.readText(path));
            if (!eligible(grant.scopes, requireWrite))
                continue;
            if (googleTokenExpired(grant, runtime.clock.now())) {
                const credentials = optional("GOOGLE_CREDENTIALS_FILE");
                if (!credentials)
                    throw new Error("Google Docs OAuth refresh requires GOOGLE_CREDENTIALS_FILE.");
                const oauth = { request: (input, init) => {
                        if (String(input) !== "https://oauth2.googleapis.com/token" && String(input) !== "https://accounts.google.com/o/oauth2/token")
                            throw new Error("Unrecognized Google OAuth token endpoint.");
                        return runtime.http.request(input, { ...init, redirect: "error" });
                    } };
                grant = await createGoogleTokensCapability(runtime.filesystem, oauth, runtime.clock, credentials, path).refresh();
                if (!eligible(grant.scopes, requireWrite))
                    continue;
            }
            if (!grant.token)
                throw new Error("Google Docs OAuth token is missing.");
            return grant.token;
        }
    return null;
}
const unsafe = (detail) => { throw new Error("Google Docs block sync cannot safely apply this edit: " + detail); };
function paragraph(line) {
    let content = line.replace(/\r?\n$/, "").replace(/ {2}$/, "");
    if (!content || /[\n\r\u0000-\u0008\u000b-\u001f\u007f-\u009f\ue000-\uf8ff]/.test(content) || /^\s*(?:>|`{3}|~{3}|\||!\[|\[[^\]]+\]:|(?:-\s*){3,}$|(?:\*\s*){3,}$)/.test(content))
        return unsafe("unsupported Markdown block");
    const list = /^([ \t]*)([-*+]|\d+[.)]) +/.exec(content);
    const heading = /^(#{1,6}) +/.exec(content);
    let level = null;
    if (list) {
        const indent = list[1].replace(/\t/g, "  ").length;
        if (indent % 2 || indent > 16)
            return unsafe("unsupported list indentation");
        level = indent / 2;
        content = content.slice(list[0].length);
    }
    else if (heading)
        content = content.slice(heading[0].length);
    // Interpret only the markup we can encode in Docs. Unknown constructs
    // must never become literal markup, or lose their rich-text semantics.
    let text = "";
    const spans = [];
    const emit = (value, style) => {
        const from = text.length;
        text += value;
        if (value && Object.keys(style).length)
            spans.push({ from, to: text.length, style });
    };
    const read = (s, style, depth) => {
        if (depth > 5)
            return unsafe("unsupported inline formatting");
        let i = 0, begin = 0;
        while (i < s.length) {
            const c = s[i];
            if (c === "\\" && /[\\`*_{}\[\]()#+\-.!|=~>]/.test(s[i + 1] ?? " ")) {
                emit(s.slice(begin, i), style);
                emit(s[i + 1], style);
                begin = i += 2;
                continue;
            }
            if (c === "!" && s[i + 1] === "[" || c === "`" || c === "<" && /^<\/?[\w!]/.test(s.slice(i)) || c === "&" && /^&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(s.slice(i)))
                return unsafe("unsupported inline content");
            if (c === "[") {
                const link = /^\[([^\[\]]+)\]\((https?:\/\/[^\s()]+|mailto:[^\s()]+)\)/.exec(s.slice(i));
                if (!link)
                    return unsafe("unsupported link syntax");
                emit(s.slice(begin, i), style);
                read(link[1], { ...style, link: { url: link[2] } }, depth + 1);
                begin = i += link[0].length;
                continue;
            }
            const marker = /^(\*{1,3}|_{1,3}|~~)/.exec(s.slice(i))?.[0];
            if (marker && !(c === "_" && /\w/.test(s[i - 1] ?? "") && /\w/.test(s[i + marker.length] ?? ""))) {
                const end = s.indexOf(marker, i + marker.length);
                if (end <= i + marker.length || /\s/.test(s[i + marker.length]) || /\s/.test(s[end - 1]))
                    return unsafe("ambiguous emphasis");
                emit(s.slice(begin, i), style);
                read(s.slice(i + marker.length, end), { ...style, ...(marker === "~~" ? { strikethrough: true } : { ...(marker.length >= 2 && { bold: true }), ...(marker.length !== 2 && { italic: true }) }) }, depth + 1);
                begin = i = end + marker.length;
                continue;
            }
            i++;
        }
        emit(s.slice(begin), style);
    };
    read(content, {}, 0);
    if (!text || text.startsWith("\t"))
        return unsafe("empty or tab-prefixed paragraph");
    return { text, spans, heading: heading ? "HEADING_" + heading[1].length : "NORMAL_TEXT", level, numbered: !!list && /^\d/.test(list[2]) };
}
// One blank separator around a heading or a list is supplied by the Google
// exporter. Other blank paragraphs are content and must not disappear.
const blank = "\n";
function spacedBlocks(md) {
    const rows = docBlocks(md).map(l => l.replace(/\r?\n$/, "").replace(/ {2}$/, ""));
    const separated = (s) => !!s && /^\s*(?:#{1,6}|[-*+]|\d+[.)]) +/.test(s);
    const result = [];
    for (let i = 0; i < rows.length;) {
        if (rows[i].trim()) {
            result.push(rows[i++]);
            continue;
        }
        const start = i;
        while (i < rows.length && !rows[i].trim())
            i++;
        const optional = separated(rows[start - 1]) || separated(rows[i]);
        for (let n = start + Number(optional); n < i; n++)
            result.push(blank);
    }
    return result;
}
export function nativeDocMarkdownEqual(left, right) {
    const normalized = (s) => spacedBlocks(s).map(l => {
        try {
            return paragraph(l);
        }
        catch {
            return l;
        }
    });
    return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}
// Keep disjoint unchanged runs in place, including their native formatting
// and anchored comments. Bounds apply only to the middle after trimming the
// common ends. Oversized ambiguous rewrites are rejected before submission.
function characters(block) {
    let pos = 0, span = 0;
    return Array.from(block.text, text => {
        while (span < block.spans.length && block.spans[span].to <= pos)
            span++;
        const s = block.spans[span];
        const c = { text, pos, style: s && s.from <= pos ? s.style : {} };
        pos += text.length;
        return c;
    });
}
function characterMatches(a, b) {
    let l = 0, r = 0;
    while (l < a.length && l < b.length && a[l].text === b[l].text)
        l++;
    while (r < a.length - l && r < b.length - l && a[a.length - r - 1].text === b[b.length - r - 1].text)
        r++;
    const n = a.length - r - l, m = b.length - r - l, stride = m + 1;
    if (n && m && (n + 1) * stride > 1_000_000)
        return unsafe("paragraph rewrite is too large to preserve native ranges");
    const matches = Array.from({ length: l }, (_, i) => [i, i]);
    if (n && m) {
        const dp = new Uint32Array((n + 1) * stride);
        for (let i = n - 1; i >= 0; i--)
            for (let j = m - 1; j >= 0; j--) {
                dp[i * stride + j] = a[i + l].text === b[j + l].text ? dp[(i + 1) * stride + j + 1] + 1 : Math.max(dp[(i + 1) * stride + j], dp[i * stride + j + 1]);
            }
        for (let i = 0, j = 0; i < n && j < m;) {
            if (a[i + l].text === b[j + l].text) {
                matches.push([i + l, j + l]);
                i++;
                j++;
            }
            else if (dp[(i + 1) * stride + j] >= dp[i * stride + j + 1])
                i++;
            else
                j++;
        }
    }
    for (let i = 0; i < r; i++)
        matches.push([a.length - r + i, b.length - r + i]);
    matches.push([a.length, b.length]);
    return matches;
}
function plan(tab, previous, desired, comments) {
    const oldLayout = spacedBlocks(previous), newLayout = spacedBlocks(desired);
    for (const c of docChanges(oldLayout, newLayout)) {
        const was = oldLayout.slice(c.start, c.end);
        if ((was.includes(blank) || c.replacement.includes(blank)) &&
            (was.length !== c.replacement.length || was.some((v, i) => (v === blank) !== (c.replacement[i] === blank))))
            return unsafe("editing blank paragraph spacing");
    }
    const before = oldLayout.filter(l => l !== blank), after = newLayout.filter(l => l !== blank);
    let offset = 0;
    const changes = docChanges(before, after).map(c => {
        const next = c.start + offset;
        offset += c.replacement.length - (c.end - c.start);
        return { ...c, next };
    });
    const body = tab.documentTab.body.content, last = body.at(-1), tabId = tab.tabProperties.tabId;
    const range = (startIndex, endIndex) => ({ startIndex, endIndex, tabId });
    const location = (index) => ({ index, tabId });
    const requests = [];
    const named = Object.values(tab.documentTab.namedRanges ?? {}).flatMap(n => n.namedRanges?.flatMap(n => n.ranges) ?? []);
    const protectedRanges = [...named, ...comments];
    const guardText = (start, end) => {
        if (protectedRanges.some(r => start === end ? start >= r.startIndex && start <= r.endIndex : start < r.endIndex && end > r.startIndex))
            return unsafe("edit overlaps a named range or anchored comment");
    };
    const locate = (i) => {
        const block = paragraph(before[i]);
        const matches = body.filter(e => {
            const p = e.paragraph;
            return p && p.elements.every(run => run.textRun) && p.elements.map(run => run.textRun.content).join("") === block.text + "\n"
                && (p.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT") === block.heading
                && (p.bullet ? p.bullet.nestingLevel ?? 0 : null) === block.level;
        });
        if (matches.length !== 1)
            return unsafe("paragraph is missing or ambiguous");
        const e = matches[0];
        if (!Number.isInteger(e.startIndex) || e.endIndex - e.startIndex !== block.text.length + 1)
            return unsafe("unrecognized paragraph range");
        return { block, e, start: e.startIndex, end: e.endIndex };
    };
    const style = (block, start, reset) => {
        if (reset)
            requests.push({ updateTextStyle: { range: range(start, start + block.text.length), textStyle: block.heading === "NORMAL_TEXT" ? {} : { bold: false, italic: false, strikethrough: false }, fields: "bold,italic,strikethrough,link" } });
        for (const s of block.spans)
            requests.push({ updateTextStyle: { range: range(start + s.from, start + s.to), textStyle: s.style, fields: Object.keys(s.style).join(",") } });
    };
    const setParagraph = (block, start, hasBullet, structure, priorLevel, headingChanged) => {
        if (!structure)
            return;
        const part = range(start, start + 1);
        if (hasBullet)
            requests.push({ deleteParagraphBullets: { range: part } });
        if (headingChanged || hasBullet)
            requests.push({ updateParagraphStyle: { range: part, paragraphStyle: headingChanged ? { namedStyleType: block.heading } : {}, fields: headingChanged ? "namedStyleType,indentStart,indentFirstLine" : "indentStart,indentFirstLine" } });
        if (block.level !== null) {
            // Docs subtracts the shallowest level in each create request. Use a
            // temporary root in this atomic batch, rather than re-listing a real
            // adjacent paragraph and changing its list ID or styling.
            const relative = block.level - priorLevel;
            if (relative < 0)
                return unsafe("outdent would split the preceding native list");
            const prefix = relative ? "x\n" + "\t".repeat(relative) : "";
            if (prefix)
                requests.push({ insertText: { location: location(start), text: prefix } });
            requests.push({ createParagraphBullets: { range: range(start, start + prefix.length + 1), bulletPreset: block.numbered ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE" } });
            if (prefix)
                requests.push({ deleteContentRange: { range: range(start, start + 2) } });
        }
    };
    const precedingLevel = (at, b) => {
        const para = body.find(e => e.endIndex === at)?.paragraph;
        const bullet = para?.bullet;
        if (!bullet || b.level === null)
            return 0;
        const levels = tab.documentTab.lists?.[bullet.listId]?.listProperties.nestingLevels;
        if (!levels?.length)
            return unsafe("cannot determine previous list format");
        if (!!levels[0]?.glyphType !== b.numbered)
            return 0;
        return bullet.nestingLevel ?? 0;
    };
    function editable(target, destructive) {
        const p = target.e.paragraph;
        if (JSON.stringify(p).includes('"suggested') || p["positionedObjectIds"] || p["pageBreakBefore"] || (destructive && p.paragraphStyle?.headingId))
            return unsafe("paragraph has a named range, suggestion, object or heading anchor");
    }
    for (const c of [...changes].reverse()) {
        const old = before.slice(c.start, c.end).map((_line, i) => locate(c.start + i));
        const added = c.replacement.map(paragraph);
        for (const [i, b] of added.entries()) {
            if (b.level === null || b.level === 0 || old.length === added.length && old[i]?.block.level === b.level && old[i]?.block.numbered === b.numbered)
                continue;
            const prior = after[c.next + i - 1];
            const p = prior ? paragraph(prior) : null;
            if (p?.level == null || p.numbered !== b.numbered || b.level > p.level + 1)
                return unsafe("nested item needs a matching parent list level");
        }
        if (old.length === 1 && added.length === 1) {
            const o = old[0], b = added[0];
            editable(o, false);
            const structure = b.heading !== o.block.heading || b.level !== o.block.level || b.numbered !== o.block.numbered;
            const from = characters(o.block), to = characters(b), keep = characterMatches(from, to);
            let ai = 0, bi = 0;
            const edits = [];
            const previous = new Map();
            for (const [i, j] of keep) {
                const at = o.start + (from[ai]?.pos ?? o.block.text.length);
                const removed = (from[i]?.pos ?? o.block.text.length) - (at - o.start);
                const added = b.text.slice(to[bi]?.pos ?? b.text.length, to[j]?.pos ?? b.text.length);
                if (removed || added) {
                    if (removed)
                        guardText(at, at + removed);
                    if (added)
                        guardText(at, at);
                    // Anchor the unchanged text before removing old characters.
                    edits.push([
                        ...(added ? [{ insertText: { location: location(at), text: added } }] : []),
                        ...(removed ? [{ deleteContentRange: { range: range(at + added.length, at + added.length + removed) } }] : []),
                    ]);
                }
                if (i < from.length)
                    previous.set(j, from[i].style);
                ai = i + 1;
                bi = j + 1;
            }
            for (const edit of edits.reverse())
                requests.push(...edit);
            const headingChanged = b.heading !== o.block.heading;
            if (headingChanged && o.e.paragraph.paragraphStyle?.headingId)
                return unsafe("changing a linked heading");
            if (headingChanged && o.e.paragraph.elements.some(el => Object.keys(el.textRun?.textStyle ?? {}).some(k => !["bold", "italic", "strikethrough", "link"].includes(k))))
                return unsafe("heading change would reset extra text styling");
            if (structure)
                guardText(o.start, o.end);
            setParagraph(b, o.start, !!o.e.paragraph.bullet, structure, structure ? precedingLevel(o.start, b) : 0, headingChanged);
            // A change in paragraph style can reset native inline styling. Text
            // edits alone touch only fields whose Markdown representation changed.
            let pending;
            const flush = () => {
                if (pending)
                    requests.push({ updateTextStyle: { range: range(o.start + pending.start, o.start + pending.end), textStyle: pending.style, fields: pending.fields } });
                pending = undefined;
            };
            for (let j = 0; j < to.length; j++) {
                const c = to[j], prior = previous.get(j);
                const fields = ["bold", "italic", "strikethrough", "link"].filter(k => !prior || headingChanged || JSON.stringify(prior[k]) !== JSON.stringify(c.style[k]));
                if (!fields.length) {
                    flush();
                    continue;
                }
                const s = Object.fromEntries(fields.filter(k => c.style[k] !== undefined || k !== "link" && b.heading !== "NORMAL_TEXT").map(k => [k, c.style[k] ?? false]));
                const mask = fields.join(",");
                if (pending && pending.fields === mask && JSON.stringify(pending.style) === JSON.stringify(s))
                    pending.end = c.pos + c.text.length;
                else {
                    flush();
                    pending = { start: c.pos, end: c.pos + c.text.length, fields: mask, style: s };
                }
            }
            flush();
            continue;
        }
        if (old.length && added.length)
            return unsafe("cannot replace a range of different-sized paragraph groups");
        if (old.length) {
            for (const o of old)
                editable(o, true);
            if (old.some((o, i) => i && old[i - 1].end !== o.start))
                return unsafe("native content between deleted paragraphs");
            let a = old[0].start, z = old.at(-1).end;
            if (z === last?.endIndex) {
                if (a === 1)
                    return unsafe("deleting the entire document");
                const preceding = body.find(e => e.endIndex === a);
                if (!preceding?.paragraph)
                    return unsafe("cannot delete the last paragraph after a native object");
                a--;
                z--;
            }
            guardText(a, z);
            requests.push({ deleteContentRange: { range: range(a, z) } });
            continue;
        }
        const right = c.start < before.length ? locate(c.start) : undefined;
        const left = c.start > 0 ? locate(c.start - 1) : undefined;
        if (left && right && left.end !== right.start)
            return unsafe("native content between insertion anchors");
        const append = !right && !!left;
        if (append && left.end !== last?.endIndex || !left && right && right.start !== 1)
            return unsafe("native content beyond insertion anchor");
        if (!right && !left && !(last?.startIndex === 1 && last?.paragraph?.elements[0]?.textRun?.content === "\n"))
            return unsafe("no native insertion anchor");
        const neighbor = right ?? left;
        if (neighbor) {
            editable(neighbor, false);
            if (right?.e.paragraph?.paragraphStyle?.headingId)
                return unsafe("splitting a heading may move its anchor");
        }
        const at = right?.start ?? (left ? left.end - 1 : 1);
        guardText(at, at);
        const text = added.map(b => b.text).join("\n");
        requests.push({ insertText: { location: location(at), text: append ? "\n" + text : right ? text + "\n" : text } });
        let pos = at + Number(append);
        let previousAdded;
        for (const b of added) {
            const preceding = previousAdded ? previousAdded.numbered === b.numbered ? previousAdded.level ?? 0 : 0 : precedingLevel(append ? left.end : pos, b);
            setParagraph(b, pos, !!neighbor?.e.paragraph?.bullet, true, preceding, (neighbor?.block.heading ?? "NORMAL_TEXT") !== b.heading);
            previousAdded = b;
            style(b, pos, true);
            pos += b.text.length + 1;
        }
    }
    return requests;
}
// Docs API omits comments. Drive's anchor is not a Docs API index; only
// quoted content can be reconciled with ranges in this exact native snapshot.
async function anchoredComments(runtime, id, headers, tab, tabs) {
    const found = [], pages = new Set();
    const locate = (t, quote) => {
        const ranges = [];
        let content = "", first = 0;
        function scan() {
            for (let i = content.indexOf(quote); i !== -1; i = content.indexOf(quote, i + 1))
                ranges.push({ startIndex: first + i, endIndex: first + i + quote.length });
            content = "";
        }
        for (const row of t.documentTab.body.content) {
            if (!row.paragraph) {
                scan();
                continue;
            }
            for (const el of row.paragraph.elements) {
                const s = el.textRun?.content, start = Number(el["startIndex"] ?? row.startIndex);
                if (!s) {
                    scan();
                    continue;
                }
                if (content && first + content.length !== start)
                    scan();
                if (!content)
                    first = start;
                content += s;
            }
        }
        scan();
        return ranges;
    };
    let cursor = "";
    do {
        const query = new URLSearchParams({ fields: "nextPageToken,comments(anchor,quotedFileContent)", pageSize: "100", ...(cursor && { pageToken: cursor }) });
        const res = await googleRead(runtime, "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "/comments?" + query, { headers, redirect: "error" });
        if (!res.ok)
            throw new Error("Google Drive comment check failed: HTTP " + res.status + ". Block uploads require permission to read document comments.");
        const data = await res.json();
        if (!Array.isArray(data.comments))
            return unsafe("incomplete comment metadata");
        for (const c of data.comments) {
            if (!c.anchor && !c.quotedFileContent)
                continue; // Whole-file comment
            const quote = c.quotedFileContent?.value;
            const mime = c.quotedFileContent?.mimeType;
            // Drive returns text/html even for a plain-text quote. Only accept it
            // verbatim if there are no entities or tags to interpret.
            if (!quote || mime && mime !== "text/plain" && !(mime === "text/html" && !/[<&]/.test(quote)))
                return unsafe("comment has no mappable quoted text");
            const matches = locate(tab, quote);
            if (!matches.length && !tabs.some(t => t !== tab && locate(t, quote).length))
                return unsafe("cannot locate an anchored comment");
            found.push(...matches);
        }
        cursor = data.nextPageToken ?? "";
        if (cursor && pages.has(cursor))
            return unsafe("repeated comment page token");
        pages.add(cursor);
    } while (cursor);
    return found;
}
export async function tryUploadDocBlocks(runtime, documentId, key, tabId, remoteMarkdown, desiredMarkdown, confirmRemote) {
    const token = await nativeDocsToken(runtime);
    if (!token)
        return false;
    const url = "https://docs.googleapis.com/v1/documents/" + encodeURIComponent(documentId);
    const headers = { authorization: "Bearer " + token, ...(key && { "X-Goog-Drive-Resource-Keys": documentId + "/" + key }) };
    const response = await googleRead(runtime, url + "?includeTabsContent=true&suggestionsViewMode=SUGGESTIONS_INLINE", { headers, redirect: "error" });
    if (!response.ok)
        throw new Error("Google Docs block read failed: HTTP " + response.status);
    const data = await response.json();
    if (data.documentId !== documentId || !data.revisionId)
        return unsafe("missing document identity or revision");
    const tabs = [];
    function visit(items) { for (const t of items) {
        tabs.push(t);
        visit(t.childTabs ?? []);
    } }
    visit(data.tabs ?? []);
    if (!tabId && tabs.length > 1)
        return unsafe("this document has multiple tabs; sync the URL with an explicit tab ID");
    const tab = tabId ? tabs.find(t => t.tabProperties.tabId === tabId) : tabs[0];
    if (!tab?.documentTab?.body?.content)
        return unsafe("missing target tab");
    const comments = await anchoredComments(runtime, documentId, headers, tab, tabs);
    const requests = plan(tab, remoteMarkdown, desiredMarkdown, comments);
    if (await confirmRemote() !== remoteMarkdown)
        throw new Error("Google Docs changed before writing; sync again.");
    if (!requests.length)
        return true;
    const update = await runtime.http.request(url + ":batchUpdate", { method: "POST", headers: { ...headers, "content-type": "application/json" }, redirect: "error", body: JSON.stringify({ writeControl: { requiredRevisionId: data.revisionId }, requests }) });
    if (!update.ok)
        throw new Error("Google Docs block update failed: HTTP " + update.status + ". Sync again to check the current revision.");
    return true;
}
//# sourceMappingURL=native-docs.js.map