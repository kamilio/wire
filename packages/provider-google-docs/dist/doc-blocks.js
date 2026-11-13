// Google Markdown exports give paragraphs no persistent IDs. Match the common
// paragraphs in order; keep tables and fenced code as indivisible blocks.
export function docBlocks(markdown) {
    const result = [];
    const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    for (let i = 0; i < lines.length; i++) {
        let block = lines[i];
        const fence = /^ {0,3}(`{3,}|~{3,})/.exec(block)?.[1];
        if (fence) {
            const close = new RegExp("^ {0,3}" + fence[0] + "{" + fence.length + ",}\\s*$");
            while (i + 1 < lines.length) {
                const next = lines[++i];
                block += next;
                if (close.test(next))
                    break;
            }
        }
        else if (/^\s*\|/.test(block)) {
            while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1]))
                block += lines[++i];
        }
        result.push(block);
    }
    return result;
}
function occurrences(blocks, start, end) {
    const positions = new Map();
    for (let i = start; i < end; i++)
        positions.set(blocks[i], positions.has(blocks[i]) ? -1 : i);
    return positions;
}
// Unique unchanged blocks anchor the diff without a quadratic LCS matrix.
// Inside each gap, identical ends (including repeated blank lines) still match.
export function docChanges(base, side) {
    const changes = [];
    let start = 0, s = 0, end = base.length, e = side.length;
    const gap = (a, b, c, d) => {
        while (a < b && c < d && base[a] === side[c]) {
            a++;
            c++;
        }
        while (a < b && c < d && base[b - 1] === side[d - 1]) {
            b--;
            d--;
        }
        if (a === b && c === d)
            return;
        if (b - a === d - c) {
            for (; a < b; a++, c++)
                if (base[a] !== side[c])
                    changes.push({ start: a, end: a + 1, replacement: [side[c]] });
        }
        else
            changes.push({ start: a, end: b, replacement: side.slice(c, d) });
    };
    while (start < end && s < e && base[start] === side[s]) {
        start++;
        s++;
    }
    while (start < end && s < e && base[end - 1] === side[e - 1]) {
        end--;
        e--;
    }
    const old = occurrences(base, start, end), next = occurrences(side, s, e);
    const anchors = [...old].filter(([value, i]) => i >= 0 && (next.get(value) ?? -1) >= 0);
    // If anchors have crossed, the text alone cannot tell a move from replacement.
    if (anchors.some(([value], i) => i > 0 && next.get(value) < next.get(anchors[i - 1][0]))) {
        changes.push({ start, end, replacement: side.slice(s, e) });
        return changes;
    }
    for (const [value, i] of anchors) {
        const j = next.get(value);
        gap(start, i, s, j);
        start = i + 1;
        s = j + 1;
    }
    gap(start, end, s, e);
    return changes;
}
function conflict() {
    throw new Error("Google Docs changed remotely and locally. Resolve the conflict in Google Docs or the local Markdown file before syncing again.");
}
export function mergeDocBlocks(base, local, remote) {
    if (base === remote || local === remote)
        return local;
    if (base === local)
        return remote;
    const blocks = docBlocks(base);
    const localBlocks = docBlocks(local), remoteBlocks = docBlocks(remote);
    const localChanges = docChanges(blocks, localBlocks), remoteChanges = docChanges(blocks, remoteBlocks);
    const positions = occurrences(blocks, 0, blocks.length);
    // Inserting or deleting repeated paragraphs leaves multiple plausible
    // identities. Do not compose another edit with a guessed correspondence.
    for (const [side, changes] of [[localBlocks, localChanges], [remoteBlocks, remoteChanges]]) {
        const sidePositions = occurrences(side, 0, side.length);
        for (const change of changes) {
            if (change.end - change.start === change.replacement.length)
                continue;
            if ([...blocks.slice(change.start, change.end), ...change.replacement].some(block => block.trim() && (positions.get(block) === -1 || (positions.has(block) && sidePositions.get(block) === -1))))
                conflict();
        }
    }
    const all = [...localChanges, ...remoteChanges].sort((a, b) => a.start - b.start || a.end - b.end);
    let pos = 0, previous;
    const result = [];
    for (const change of all) {
        if (previous && previous.start === change.start && previous.end === change.end && previous.replacement.join("") === change.replacement.join(""))
            continue;
        if (change.start < pos || (previous && previous.start === previous.end && change.start === change.end && previous.start === change.start))
            conflict();
        result.push(blocks.slice(pos, change.start).join(""), change.replacement.join(""));
        pos = change.end;
        previous = change;
    }
    return result.join("") + blocks.slice(pos).join("");
}
//# sourceMappingURL=doc-blocks.js.map