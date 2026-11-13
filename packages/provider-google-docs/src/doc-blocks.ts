import { WireMergeConflict } from "wire-core";

// Google Markdown exports give paragraphs no persistent IDs. Match the common
// paragraphs in order; keep tables and fenced code as indivisible blocks.
export function docBlocks(markdown: string): string[] {
  const result: string[] = [];
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  for (let i = 0; i < lines.length; i++) {
    let block = lines[i]!;
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(block)?.[1];
    if (fence) {
      const close = new RegExp("^ {0,3}" + fence[0] + "{" + fence.length + ",}\\s*$");
      while (i + 1 < lines.length) {
        const next = lines[++i]!;
        block += next;
        if (close.test(next)) break;
      }
    } else if (/^\s*\|/.test(block)) {
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1]!)) block += lines[++i]!;
    }
    result.push(block);
  }
  return result;
}

type Change = { start: number; end: number; replacement: string[] };

function occurrences(blocks: readonly string[], start: number, end: number): Map<string, number> {
  const positions = new Map<string, number>();
  for (let i = start; i < end; i++) positions.set(blocks[i]!, positions.has(blocks[i]!) ? -1 : i);
  return positions;
}

// Unique unchanged blocks anchor the diff without a quadratic LCS matrix.
// Inside each gap, identical ends (including repeated blank lines) still match.
export function docChanges(base: readonly string[], side: readonly string[]): Change[] {
  const changes: Change[] = [];
  let start = 0, s = 0, end = base.length, e = side.length;
  const gap = (a: number, b: number, c: number, d: number) => {
    while (a < b && c < d && base[a] === side[c]) { a++; c++; }
    while (a < b && c < d && base[b - 1] === side[d - 1]) { b--; d--; }
    if (a === b && c === d) return;
    if (b - a === d - c) {
      for (; a < b; a++, c++) if (base[a] !== side[c]) changes.push({ start: a, end: a + 1, replacement: [side[c]!] });
    } else changes.push({ start: a, end: b, replacement: side.slice(c, d) });
  };
  while (start < end && s < e && base[start] === side[s]) { start++; s++; }
  while (start < end && s < e && base[end - 1] === side[e - 1]) { end--; e--; }
  const old = occurrences(base, start, end), next = occurrences(side, s, e);
  const anchors = [...old].filter(([value, i]) => i >= 0 && (next.get(value) ?? -1) >= 0);
  // If anchors have crossed, the text alone cannot tell a move from replacement.
  if (anchors.some(([value], i) => i > 0 && next.get(value)! < next.get(anchors[i - 1]![0])!)) {
    changes.push({ start, end, replacement: side.slice(s, e) });
    return changes;
  }
  for (const [value, i] of anchors) {
    const j = next.get(value)!;
    gap(start, i, s, j);
    start = i + 1; s = j + 1;
  }
  gap(start, end, s, e);
  return changes;
}

// With no paragraph IDs, certify only one deletion between two distinct,
// unchanged, unique neighbors. Never align a run of identical siblings or a
// moved section by position. The other edit must leave the whole slot intact.
export function boundedDeletion(base: readonly string[], side: readonly string[], other: readonly string[], i: number): boolean {
  const left = base[i - 1], value = base[i], right = base[i + 1];
  if (!left?.trim() || !value?.trim() || !right?.trim() || left === right) return false;
  const old = occurrences(base, 0, base.length);
  if (old.get(left) !== i-1 || old.get(right) !== i+1) return false;
  for (const rows of [side, other]) {
    const next = occurrences(rows, 0, rows.length);
    const lo = next.get(left) ?? -1, hi = next.get(right) ?? -1;
    if (lo < 0 || hi !== lo + (rows === side ? 1 : 2) || rows === other && rows[lo+1] !== value) return false;
    let last = -1;
    for (const [line,n] of old) {
      const j = next.get(line) ?? -1;
      if (n < 0 || j < 0) continue;
      if (j <= last) return false;
      last = j;
    }
  }
  const count = (rows: readonly string[]) => rows.reduce((n,r) => n + Number(r === value), 0);
  return count(side) === count(base)-1;
}

function conflictMessage(location = ""): string {
  return `Google Docs changed remotely and locally.${location} Resolve the conflict in Google Docs or the local Markdown file before syncing again.`;
}

function conflict(location = ""): never {
  throw new WireMergeConflict(conflictMessage(location));
}

export function mergeDocBlocks(base: string, local: string, remote: string, sameRendering: (local: string, remote: string) => boolean = (a, b) => a === b): string {
  if (base === remote || local === remote) return local;
  if (base === local) return remote;
  const blocks = docBlocks(base);
  const localBlocks = docBlocks(local), remoteBlocks = docBlocks(remote);
  const remoteChanges = docChanges(blocks, remoteBlocks);
  const remoteAt = new Map(remoteChanges.map(change => [change.start, change]));
  // A previous write may have landed before its acknowledgment was lost.
  // Compare only replacements of the identical base interval. Keep Google's
  // spelling of an already-applied change, including its paragraph separators.
  const localChanges = docChanges(blocks, localBlocks).filter(change => {
    const other = remoteAt.get(change.start);
    return !other || other.end !== change.end || !sameRendering(change.replacement.join(""), other.replacement.join(""));
  });
  if (!localChanges.length) return remote;
  const positions = occurrences(blocks, 0, blocks.length);
  // Inserting or deleting repeated paragraphs leaves multiple plausible
  // identities. Do not compose another edit with a guessed correspondence.
  for (const [side, changes] of [[localBlocks, localChanges], [remoteBlocks, remoteChanges]] as const) {
    const sidePositions = occurrences(side, 0, side.length);
    for (const change of changes) {
      if (change.end - change.start === change.replacement.length) continue;
      const repeated = [...blocks.slice(change.start, change.end), ...change.replacement].some(block =>
        block.trim() && (positions.get(block) === -1 || (positions.has(block) && sidePositions.get(block) === -1)));
      if (repeated && !(change.end === change.start + 1 && !change.replacement.length &&
          boundedDeletion(blocks, side, side === localBlocks ? remoteBlocks : localBlocks, change.start))) throw new Error(conflictMessage());
    }
  }
  const all = [...localChanges, ...remoteChanges].sort((a, b) => a.start - b.start || a.end - b.end);
  let pos = 0, previous: Change | undefined;
  const result: string[] = [];
  for (const change of all) {
    if (change.start < pos || (previous && previous.start === previous.end && change.start === change.end && previous.start === change.start)) {
      // Report a line only when both edits target one identifiable original
      // block and its local replacement is unambiguous in the current file.
      if (previous?.start === change.start && previous.end === change.end && change.end === change.start + 1) {
        const unique = (rows: readonly string[], i: number) => i >= 0 && rows.every((row, n) => n === i || !sameRendering(row.replace(/\r?\n$/, ""), rows[i]!.replace(/\r?\n$/, "")));
        const replacement = localChanges.find(c => c.start === change.start)?.replacement;
        if (replacement?.length === 1 && unique(blocks, change.start)) {
          const block = replacement[0]!, index = localBlocks.indexOf(block);
          if (unique(localBlocks, index)) {
            const first = 1 + localBlocks.slice(0, index).reduce((n, b) => n + b.split("\n").length - 1, 0);
            const last = first + block.replace(/\n$/, "").split("\n").length - 1;
            if (last - first > 5) conflict(` Local Markdown line ${first} (start of block).`);
            conflict(first === last ? ` Local Markdown line ${first}.` : ` Local Markdown lines ${first}-${last}.`);
          }
        }
      }
      conflict();
    }
    result.push(blocks.slice(pos, change.start).join(""), change.replacement.join(""));
    pos = change.end; previous = change;
  }
  return result.join("") + blocks.slice(pos).join("");
}
