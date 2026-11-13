import { createGoogleTokensCapability, googleTokenExpired, parseGoogleToken } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
import { googleRead } from "./google-read.js";
import { docBlocks, docChanges } from "./doc-blocks.js";

function eligible(scopes: readonly string[] | undefined, requireWrite: boolean): boolean {
  const has = (name: string) => scopes?.includes("https://www.googleapis.com/auth/"+name);
  if (!requireWrite && (has("documents.readonly") || has("documents") || has("drive.readonly"))) return true;
  return !!(has("drive") || has("drive.file") || (has("documents") && has("drive.readonly")));
}

export async function nativeDocsGrant(runtime: RuntimeCapabilities, readOnly = false): Promise<{ token: string; driveExport: boolean; canWrite: boolean } | null> {
  const optional = (key: string) => runtime.configuration.getOptional?.(key);
  for (const requireWrite of readOnly ? [true, false] : [true]) for (const name of ["GOOGLE_DOCS_TOKEN_FILE", "GOOGLE_FORMS_TOKEN_FILE"]) {
    const path = optional(name);
    if (!path || !await runtime.filesystem.exists(path)) continue;
    let grant = parseGoogleToken(await runtime.filesystem.readText(path));
    if (!eligible(grant.scopes,requireWrite)) continue;
    if (googleTokenExpired(grant, runtime.clock.now())) {
      const credentials = optional("GOOGLE_CREDENTIALS_FILE");
      if (!credentials) throw new Error("Google Docs OAuth refresh requires GOOGLE_CREDENTIALS_FILE.");
      const oauth = { request: (input: string | URL | Request, init?: RequestInit) => {
        if (String(input) !== "https://oauth2.googleapis.com/token" && String(input) !== "https://accounts.google.com/o/oauth2/token") throw new Error("Unrecognized Google OAuth token endpoint.");
        return runtime.http.request(input, { ...init, redirect: "error" });
      } };
      grant = await createGoogleTokensCapability(runtime.filesystem, oauth, runtime.clock, credentials, path).refresh();
      if (!eligible(grant.scopes,requireWrite)) continue;
    }
    if (!grant.token) throw new Error("Google Docs OAuth token is missing.");
    return { token: grant.token, canWrite: eligible(grant.scopes,true), driveExport: !!grant.scopes?.some(scope => ["drive", "drive.file", "drive.readonly"].some(name => scope === "https://www.googleapis.com/auth/" + name)) };
  }
  return null;
}

type Style = { bold?: boolean; italic?: boolean; strikethrough?: boolean; link?: { url: string } };
type Span = { from: number; to: number; style: Style };
type Block = { text: string; spans: Span[]; heading: string; level: number | null; numbered: boolean };
const unsafe = (detail: string): never => { throw new Error("Google Docs block sync cannot safely apply this edit: " + detail); };

function paragraph(line: string): Block {
  let content = line.replace(/\r?\n$/, "").replace(/ {2}$/, "");
  if (!content || /[\n\r\u0000-\u0008\u000b-\u001f\u007f-\u009f\ue000-\uf8ff]/.test(content) || /^\s*(?:>|`{3}|~{3}|\||!\[|\[[^\]]+\]:|(?:-\s*){3,}$|(?:\*\s*){3,}$)/.test(content)) return unsafe("unsupported Markdown block");
  const list = /^([ \t]*)([-*+]|\d+[.)]) +/.exec(content);
  const heading = /^(#{1,6}) +/.exec(content);
  let level = null;
  if (list) {
    const indent = list[1]!.replace(/\t/g, "  ").length;
    if (indent % 2 || indent > 16) return unsafe("unsupported list indentation");
    level = indent / 2;
    content = content.slice(list[0].length);
  } else if (heading) content = content.slice(heading[0].length);
  // Interpret only the markup we can encode in Docs. Unknown constructs
  // must never become literal markup, or lose their rich-text semantics.
  let text = "";
  const spans: Span[] = [];
  const emit = (value: string, style: Style) => {
    const from = text.length;
    text += value;
    if (value && Object.keys(style).length) spans.push({ from, to: text.length, style });
  };
  const read = (s: string, style: Style, depth: number): void => {
    if (depth > 5) return unsafe("unsupported inline formatting");
    let i = 0, begin = 0;
    while (i < s.length) {
      const c = s[i]!;
      if (c === "\\" && /[\\`*_{}\[\]()#+\-.!|=~>]/.test(s[i + 1] ?? " ")) {
        emit(s.slice(begin, i), style); emit(s[i + 1]!, style); begin = i += 2; continue;
      }
      if (c === "!" && s[i + 1] === "[" || c === "`" || c === "<" && /^<\/?[\w!]/.test(s.slice(i)) || c === "&" && /^&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(s.slice(i))) return unsafe("unsupported inline content");
      if (c === "[") {
        const link = /^\[([^\[\]]+)\]\((https?:\/\/[^\s()]+|mailto:[^\s()]+)\)/.exec(s.slice(i));
        if (!link) return unsafe("unsupported link syntax");
        emit(s.slice(begin, i), style);
        read(link[1]!, { ...style, link: { url: link[2]! } }, depth + 1);
        begin = i += link[0].length; continue;
      }
      const marker = /^(\*{1,3}|_{1,3}|~~)/.exec(s.slice(i))?.[0];
      if (marker && !(c === "_" && /\w/.test(s[i - 1] ?? "") && /\w/.test(s[i + marker.length] ?? ""))) {
        const end = s.indexOf(marker, i + marker.length);
        if (end <= i + marker.length || /\s/.test(s[i + marker.length]!) || /\s/.test(s[end - 1]!)) return unsafe("ambiguous emphasis");
        emit(s.slice(begin, i), style);
        read(s.slice(i + marker.length, end), { ...style, ...(marker === "~~" ? { strikethrough: true } : { ...(marker.length >= 2 && { bold: true }), ...(marker.length !== 2 && { italic: true }) }) }, depth + 1);
        begin = i = end + marker.length; continue;
      }
      i++;
    }
    emit(s.slice(begin), style);
  };
  read(content, {}, 0);
  if (!text || text.startsWith("\t")) return unsafe("empty or tab-prefixed paragraph");
  return { text, spans, heading: heading ? "HEADING_" + heading[1]!.length : "NORMAL_TEXT", level, numbered: !!list && /^\d/.test(list[2]!) };
}

// One blank separator around a heading or a list is supplied by the Google
// exporter. Other blank paragraphs are content and must not disappear.
const blank = "\n";
const markdownLines = (md: string) => docBlocks(md).map(l => l.replace(/\r?\n$/, "").replace(/ {2}$/, ""));
function spacedBlocks(md: string): string[] {
  const rows = markdownLines(md);
  const separated = (s: string | undefined) => !!s && /^\s*(?:#{1,6}|[-*+]|\d+[.)]) +/.test(s);
  const result: string[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i]!.trim()) { result.push(rows[i++]!); continue; }
    const start = i;
    while (i < rows.length && !rows[i]!.trim()) i++;
    const optional = separated(rows[start-1]) || separated(rows[i]);
    for (let n = start + Number(optional); n < i; n++) result.push(blank);
  }
  return result;
}

// In Markdown the first numeric marker sets a list's starting number.
// Following marker numbers can be rewritten by Docs when a sibling is added.
function numberStarts(rows: string[]): string[] {
  const ordered: boolean[] = [], starts: string[] = [];
  for (const row of rows) {
    if (row === blank) continue;
    const marker = /^([ \t]*)([-*+]|(\d+)[.)]) +/.exec(row);
    if (!marker) { ordered.length=0; continue; }
    const indent=marker[1]!.replace(/\t/g,"  ").length, number=marker[3];
    ordered.splice(indent+1);
    if (number && !ordered[indent]) starts.push(number);
    ordered[indent]=!!number;
  }
  return starts;
}

export function nativeDocMarkdownEqual(left: string, right: string): boolean {
  const normalized = (s: string) => spacedBlocks(s).map(l => {
    try { return paragraph(l); } catch { return l; }
  });
  return JSON.stringify(numberStarts(spacedBlocks(left))) === JSON.stringify(numberStarts(spacedBlocks(right))) && JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

type Element = { startIndex?: number; endIndex: number; paragraph?: {
  paragraphStyle?: { namedStyleType?: string; headingId?: string; [k: string]: unknown };
  bullet?: { listId: string; nestingLevel?: number }; elements: { textRun?: { content: string; textStyle?: Record<string, unknown> }; [k: string]: unknown }[];
  [k: string]: unknown;
} };
type Tab = { tabProperties: { tabId: string }; childTabs?: Tab[]; documentTab: { body: { content: Element[] }; namedRanges?: Record<string, {namedRanges?: {ranges: {startIndex: number; endIndex: number}[]}[]}>; lists?: Record<string, { listProperties: { nestingLevels: { glyphType?: string; glyphSymbol?: string; glyphFormat?: string }[] } }> } };
type DocsRequest = Record<string, unknown>;

// Keep disjoint unchanged runs in place, including their native formatting
// and anchored comments. Bounds apply only to the middle after trimming the
// common ends. Oversized ambiguous rewrites are rejected before submission.
function characters(block: Block) {
  let pos = 0, span = 0;
  return Array.from(block.text, text => {
    while (span < block.spans.length && block.spans[span]!.to <= pos) span++;
    const s = block.spans[span];
    const c = { text, pos, style: s && s.from <= pos ? s.style : {} as Style };
    pos += text.length;
    return c;
  });
}

function characterMatches(a: ReturnType<typeof characters>, b: ReturnType<typeof characters>) {
  let l = 0, r = 0;
  while (l < a.length && l < b.length && a[l]!.text === b[l]!.text) l++;
  while (r < a.length - l && r < b.length - l && a[a.length - r - 1]!.text === b[b.length - r - 1]!.text) r++;
  const n = a.length - r - l, m = b.length - r - l, stride = m + 1;
  if (n && m && (n + 1) * stride > 1_000_000) return unsafe("paragraph rewrite is too large to preserve native ranges");
  const matches: [number, number][] = Array.from({length:l}, (_,i) => [i,i]);
  if (n && m) {
    const dp = new Uint32Array((n + 1) * stride);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      dp[i * stride + j] = a[i+l]!.text === b[j+l]!.text ? dp[(i+1)*stride+j+1]!+1 : Math.max(dp[(i+1)*stride+j]!, dp[i*stride+j+1]!);
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i+l]!.text === b[j+l]!.text) { matches.push([i+l,j+l]); i++; j++; }
      else if (dp[(i+1)*stride+j]! >= dp[i*stride+j+1]!) i++; else j++;
    }
  }
  for (let i=0;i<r;i++) matches.push([a.length-r+i,b.length-r+i]);
  matches.push([a.length,b.length]);
  return matches;
}

type IndexedRange = { startIndex: number; endIndex: number };

// The LCS can match a space to an earlier copy in newly inserted text,
// leaving an insertion exactly on an otherwise intact protected boundary.
// Keep its neighboring space attached to a unique, already matched span.
function alignProtectedSpaces(
  range: IndexedRange, start: number, old: Block, next: Block,
  from: ReturnType<typeof characters>, to: ReturnType<typeof characters>, keep: [number, number][],
) {
  const lo = range.startIndex - start, hi = range.endIndex - start;
  if (lo < 0 || hi > old.text.length || lo >= hi) return;
  const span = old.text.slice(lo, hi);
  if (old.text.indexOf(span) !== old.text.lastIndexOf(span) || next.text.indexOf(span) !== next.text.lastIndexOf(span)) return;
  const k = keep.findIndex(([i]) => from[i]?.pos === lo);
  if (k < 0) return;
  const [i, j] = keep[k]!;
  // The existing diff must retain every character, on exact UTF-16 boundaries.
  let n = 0;
  while (from[i + n] && from[i + n]!.pos < hi) {
    if (keep[k + n]?.[0] !== i + n || keep[k + n]?.[1] !== j + n) return;
    n++;
  }
  if ((from[i + n]?.pos ?? old.text.length) !== hi) return;
  for (const [pair, neighbor, target] of [[keep[k - 1], i - 1, j - 1], [keep[k + n], i + n, j + n]] as const) {
    if (pair?.[0] === neighbor && from[neighbor]?.text === " " && to[target]?.text === " "
        && JSON.stringify(from[neighbor]!.style) === JSON.stringify(to[target]!.style)) pair[1] = target;
  }
}

// A rotation across a heading has only one list subtree that could have
// moved. Keep the section boundary and its native heading anchor in place.
function sectionMove(before: string[], after: string[], changes: ReturnType<typeof docChanges>) {
  if (changes.length !== 1) return;
  const {start, end, replacement} = changes[0]!;
  if (end-start !== replacement.length || replacement.length < 2) return;
  const cut=before.indexOf(replacement[0]!,start+1);
  if (cut<=start || cut>=end) return;
  const a=before.slice(start,cut), b=before.slice(cut,end);
  if (![...b,...a].every((v,i)=>v===replacement[i])) return;
  const heading=(s:string)=>/^#{1,6} /.test(s);
  const first=a.some(heading) ? false : b.some(heading) ? true : undefined;
  if (first===undefined) return;
  const moved=first?a:b, source=first?start:cut, dest=first?end:start, next=first?start+b.length:start;
  const root=(v:string|undefined)=>/^[-*+] /.test(v??"");
  const child=(v:string|undefined)=>/^[ \t]+[-*+] /.test(v??"");
  if (moved.length<2 || source+moved.length===before.length || !root(moved[0]) || !moved.slice(1).every(child) || /^[ \t]+(?:[-*+]|\d+[.)]) /.test(before[source+moved.length]??"")
      || !root(before[dest-1]) || child(after[next+moved.length])) return;
  const seen=new Set<string>(), unique=new Set(moved);
  for (const row of before) if (unique.has(row)) {
    if (seen.has(row)) return;
    seen.add(row);
  }
  const remove={start:source,end:source+moved.length,replacement:[]}, insert={start:dest,end:dest,replacement:moved};
  return {source, dest, moved, changes:first?[remove,insert]:[insert,remove]};
}

// HTML-imported lists can have a distinct, non-recreatable list ID at each
// level. When just the section boundary changes, move the three plain
// paragraphs instead. The two empty Markdown lines are export delimiters.
function plainLabelRotation(oldMd: string, newMd: string) {
  if (!oldMd.includes("\u00a0") || !newMd.includes("\u00a0")) return;
  const a=markdownLines(oldMd), b=markdownLines(newMd);
  if (a.length!==b.length) return;
  let lo=0, hi=a.length;
  while (lo<hi && a[lo]===b[lo]) lo++;
  while (lo<hi && a[hi-1]===b[hi-1]) hi--;
  if (hi-lo<7 || lo===0 || hi===a.length) return;
  const old=a.slice(lo,hi), after=b.slice(lo,hi), forward=old[0]==="";
  const label=(forward?old:after).slice(0,5), group=(forward?after:old).slice(0,-5);
  const text=label[2]!;
  if (label[0]!=="" || label[1]!=="\u00a0" || !text.trim() || label[3]!=="\u00a0" || label[4]!==""
      || !/^[-*+] /.test(group[0]!) || !group.slice(1).every(v=>/^[ \t]+[-*+] /.test(v))
      || !/^[ \t]*[-*+] /.test(a[lo-1]!) || !/^[-*+] /.test(a[hi]!)) return;
  if (!group.concat(label).every((v,i)=>v===(forward?after:old)[i]) || !label.concat(group).every((v,i)=>v===(forward?old:after)[i])) return;
  let labelBlock: Block;
  try { labelBlock=paragraph(text); } catch { return; }
  if (labelBlock.text!==text || labelBlock.heading!=="NORMAL_TEXT" || labelBlock.level!==null || labelBlock.spans.length) return;
  if (a.indexOf(text)!==a.lastIndexOf(text)) return;
  return {left:a[lo-1]!, right:a[hi]!, label, group, text, forward};
}

export function alreadyAppliedPlainLabelMove(base: string, local: string, remote: string): boolean {
  const move=plainLabelRotation(base,local);
  if (!move) return false;
  const rows=markdownLines(remote), i=rows.indexOf(move.text);
  if (i<0 || rows.lastIndexOf(move.text)!==i) return false;
  // The entire local change must already be present between both neighbors.
  // An independent web edit outside this interval is safe to download.
  const expected=[move.left,...(move.forward?move.group.concat(move.label):move.label.concat(move.group)),move.right];
  const first=i-3-(move.forward?move.group.length:0);
  return expected.every((v,j)=>rows[first+j]===v);
}

function movePlainLabel(tab: Tab, oldMd: string, newMd: string, guard: (a: number,b: number)=>void): DocsRequest[] | undefined {
  const move=plainLabelRotation(oldMd,newMd);
  if (!move) return;
  const {left,right,label,group,text,forward}=move;
  const body=tab.documentTab.body.content;
  const contents=(e:Element)=>e.paragraph?.elements.map(run=>run.textRun?.content).join("");
  const labels=body.map((e,i)=>contents(e)===text+"\n"?i:-1).filter(i=>i!==-1);
  if (labels.length!==1) return unsafe("section label is not unique");
  const middle=labels[0]!, first=middle-1, cells=body.slice(first,first+3);
  const region=[left,...(forward?label.concat(group):group.concat(label)).filter(v=>v!==""),right];
  const start=first-1-(forward?0:group.length);
  if (start<0 || !region.every((line,j)=>{
    const e=body[start+j], p=e?.paragraph, block=paragraph(line);
    return e && p && p.elements.every(r=>r.textRun) && contents(e)===block.text+"\n"
      && (p.paragraphStyle?.namedStyleType??"NORMAL_TEXT")===block.heading
      && (p.bullet?p.bullet.nestingLevel??0:null)===block.level
      && !JSON.stringify(p).includes('"suggested') && !p.positionedObjectIds;
  })) return unsafe("section boundary does not match adjacent native paragraphs");
  const ps=cells[1]!.paragraph!.paragraphStyle??{};
  if (ps.direction && ps.direction!=="LEFT_TO_RIGHT" ||
      Object.entries(ps).some(([k,v])=>{
        if (k==="namedStyleType" || k==="direction") return false;
        if (k==="shading") return JSON.stringify(v)!==JSON.stringify({backgroundColor:{}});
        // Google imports these empty borders on otherwise unstyled paragraphs.
        if (!["borderBetween","borderTop","borderBottom","borderLeft","borderRight"].includes(k)) return true;
        const border=v as { color?:object; width?:{magnitude?:number; unit?:string}; padding?:{magnitude?:number; unit?:string}; dashStyle?:string };
        return !border || border.dashStyle!=="SOLID" || Object.keys(border.color??{}).length!==0
          || [border.width,border.padding].some(d=>!d || d.unit!=="PT" || (d.magnitude??0)!==0);
      })
      || cells.some(e=>{
        const p=e.paragraph!;
        return Object.keys(p).some(k=>k!=="paragraphStyle" && k!=="elements") || JSON.stringify(p.paragraphStyle??{})!==JSON.stringify(ps)
          || p.elements.some(r=>Object.keys(r).some(k=>!["startIndex","endIndex","textRun"].includes(k)) ||
            Object.keys(r.textRun!).some(k=>k!=="content" && k!=="textStyle") || Object.keys(r.textRun!.textStyle??{}).length);
      })) return unsafe("section label or spacers have extra native formatting");
  const from=cells[0]!.startIndex!, end=cells[2]!.endIndex, dest=body[start+(forward?region.length-1:1)]!.startIndex!;
  const value="\u00a0\n"+text+"\n\u00a0\n";
  if (!Number.isInteger(from) || !Number.isInteger(dest) || end-from!==value.length) return unsafe("unrecognized section boundary range");
  guard(from,end); guard(dest,dest);
  const tabId=tab.tabProperties.tabId, range=(startIndex:number,endIndex:number)=>({startIndex,endIndex,tabId});
  const cut={deleteContentRange:{range:range(from,end)}};
  const insert=[
    {insertText:{location:{index:dest,tabId},text:value}},
    {deleteParagraphBullets:{range:range(dest,dest+value.length)}},
    {updateParagraphStyle:{range:range(dest,dest+value.length-1),paragraphStyle:ps,fields:"*"}},
    {updateTextStyle:{range:range(dest,dest+value.length),textStyle:{},fields:"*"}},
  ];
  return dest<from?[cut,...insert]:[...insert,cut];
}

function plan(tab: Tab, previous: string, desired: string, comments: IndexedRange[], allowDuplicatePosition: boolean): DocsRequest[] {
  const named = Object.values(tab.documentTab.namedRanges ?? {}).flatMap(n => n.namedRanges?.flatMap(n => n.ranges) ?? []);
  const protectedRanges = [...named,...comments];
  const guardText = (start: number, end: number) => {
    if (protectedRanges.some(r => start === end ? start >= r.startIndex && start <= r.endIndex : start < r.endIndex && end > r.startIndex)) return unsafe("edit overlaps a named range or anchored comment");
  };
  const oldLayout = spacedBlocks(previous), newLayout = spacedBlocks(desired);
  if (JSON.stringify(numberStarts(oldLayout)) !== JSON.stringify(numberStarts(newLayout))) return unsafe("cannot reproduce a change in native list numbering");
  const labelMove = movePlainLabel(tab, previous, desired, guardText);
  if (labelMove) return labelMove;
  for (const c of docChanges(oldLayout,newLayout)) {
    const was = oldLayout.slice(c.start,c.end);
    if ((was.includes(blank) || c.replacement.includes(blank)) &&
        (was.length !== c.replacement.length || was.some((v,i) => (v===blank) !== (c.replacement[i]===blank)))) return unsafe("editing blank paragraph spacing");
  }
  // Later numeric markers in the same Markdown list are not independent
  // identities. Inserting an item can renumber every following sibling.
  const rows = (layout: string[]) => layout.filter(l => l !== blank).map(l => l.replace(/^([ \t]*)\d+([.)] +)/, (_, indent: string, marker: string) => indent+"1"+marker));
  const before = rows(oldLayout), after = rows(newLayout);
  let offset = 0;
  const delta = docChanges(before,after), move = sectionMove(before,after,delta);
  const changes = (move?.changes ?? delta).map(c => {
    const next = c.start + offset;
    offset += c.replacement.length - (c.end-c.start);
    return {...c,next};
  });
  const body = tab.documentTab.body.content, last = body.at(-1), tabId = tab.tabProperties.tabId;
  const range = (startIndex: number, endIndex: number) => ({ startIndex, endIndex, tabId });
  const location = (index: number) => ({ index, tabId });
  const requests: DocsRequest[] = [];
  function matches(e: Element, block: Block) {
    const p = e.paragraph;
    return p && p.elements.every(run => run.textRun) && p.elements.map(run => run.textRun!.content).join("") === block.text + "\n"
      && (p.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT") === block.heading
      && (p.bullet ? p.bullet.nestingLevel ?? 0 : null) === block.level;
  }
  // Paragraphs have no stable IDs. For repeated labels, the occurrence is
  // provable only when the entire tab aligns and the edit did not move,
  // insert, or remove paragraphs. Never guess from two nearby anchors.
  let ordered: Element[] | undefined;
  function byPosition(i: number): Element {
    if (!ordered) {
      if (!allowDuplicatePosition || changes.some(c => c.end-c.start !== 1 || c.replacement.length !== 1 || before.includes(c.replacement[0]!))) return unsafe("duplicate paragraph identity is ambiguous");
      ordered = body.filter((e,n) => {
        if (!e.paragraph) {
          if (n === 0 && "sectionBreak" in e) return false;
          return unsafe("opaque native content makes duplicate paragraph identity ambiguous");
        }
        return !e.paragraph.elements.every(r => r.textRun) || e.paragraph.elements.map(r => r.textRun!.content).join("") !== "\n";
      });
      if (ordered.length !== before.length || !ordered.every((e,n) => {
        let b: Block;
        try { b=paragraph(before[n]!); } catch { return false; }
        if (!matches(e,b)) return false;
        const bullet=e.paragraph!.bullet;
        if (!bullet) return true;
        const level=tab.documentTab.lists?.[bullet.listId]?.listProperties.nestingLevels[bullet.nestingLevel ?? 0];
        return !!level && !!level.glyphType === b.numbered;
      })) return unsafe("duplicate paragraphs do not align with the entire native tab");
    }
    return ordered[i]!;
  }
  const locate = (i: number) => {
    const block = paragraph(before[i]!);
    const candidates = body.filter(e => matches(e,block));
    if (!candidates.length) return unsafe("paragraph is missing");
    const e = candidates.length === 1 ? candidates[0]! : byPosition(i);
    if (!Number.isInteger(e.startIndex) || e.endIndex - e.startIndex! !== block.text.length + 1) return unsafe("unrecognized paragraph range");
    return { block, e, start: e.startIndex!, end: e.endIndex };
  };
  const style = (block: Block, start: number, reset: boolean) => {
    if (reset) requests.push({ updateTextStyle: { range: range(start, start + block.text.length), textStyle: block.heading === "NORMAL_TEXT" ? {} : {bold:false,italic:false,strikethrough:false}, fields: "bold,italic,strikethrough,link" } });
    for (const s of block.spans) requests.push({ updateTextStyle: { range: range(start + s.from, start + s.to), textStyle: s.style, fields: Object.keys(s.style).join(",") } });
  };
  const setParagraph = (block: Block, start: number, hasBullet: boolean, structure: boolean, priorLevel: number, headingChanged: boolean) => {
    if (!structure) return;
    const part = range(start, start + 1);
    if (hasBullet) requests.push({ deleteParagraphBullets: { range: part } });
    if (headingChanged || hasBullet) requests.push({ updateParagraphStyle: { range: part, paragraphStyle: headingChanged ? { namedStyleType: block.heading } : {}, fields: headingChanged ? "namedStyleType,indentStart,indentFirstLine" : "indentStart,indentFirstLine" } });
    if (block.level !== null) {
      // The API cannot set a paragraph's existing listId. Applying a number
      // preset may silently start a new list even when Markdown looks right.
      if (block.numbered) return unsafe("cannot create a numbered level without a matching native list paragraph");
      // Docs subtracts the shallowest level in each create request. Use a
      // temporary root in this atomic batch, rather than re-listing a real
      // adjacent paragraph and changing its list ID or styling.
      const relative = block.level - priorLevel;
      if (relative < 0) return unsafe("outdent would split the preceding native list");
      const prefix = relative ? "x\n" + "\t".repeat(relative) : "";
      if (prefix) requests.push({ insertText: { location: location(start), text: prefix } });
      requests.push({ createParagraphBullets: { range: range(start, start + prefix.length + 1), bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } });
      if (prefix) requests.push({ deleteContentRange: { range: range(start, start + 2) } });
    }
  };
  const precedingLevel = (at: number, b: Block) => {
    const para = body.find(e => e.endIndex === at)?.paragraph;
    const bullet = para?.bullet;
    if (!bullet || b.level === null) return 0;
    const levels = tab.documentTab.lists?.[bullet.listId]?.listProperties.nestingLevels;
    if (!levels?.length) return unsafe("cannot determine previous list format");
    if (!!levels[0]?.glyphType !== b.numbered) return 0;
    if (levels.some((l,i) => l.glyphSymbol !== ["●","○","■"][i%3] || (l.glyphFormat && l.glyphFormat !== "%"+i))) return unsafe("cannot reproduce the existing native list preset");
    return bullet.nestingLevel ?? 0;
  };
  function editable(target: ReturnType<typeof locate>, destructive: boolean) {
    const p = target.e.paragraph!;
    if (JSON.stringify(p).includes('"suggested') || p["positionedObjectIds"] || p["pageBreakBefore"] || (destructive && p.paragraphStyle?.headingId)) return unsafe("paragraph has a named range, suggestion, object or heading anchor");
  }
  if (move) {
    // Moving a paragraph requires recreating it. Reject any native detail
    // that the Markdown writer cannot reproduce at the new location.
    const left=locate(move.dest-1), right=move.dest < before.length ? locate(move.dest) : undefined;
    const list=(o:typeof left)=>tab.documentTab.lists?.[o.e.paragraph!.bullet?.listId ?? ""]?.listProperties;
    const target=list(left);
    if (!target || right && (right.block.heading !== "NORMAL_TEXT" || right.block.level !== null)) return unsafe("cannot anchor the moved list at a plain section boundary");
    const allowed=(v:object,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
    const section=(i:number)=>before.slice(0,i).filter(l=>/^#{1,6} /.test(l)).length;
    if (!section(move.source) || !section(move.dest) || section(move.source)===section(move.dest)) return unsafe("list move needs distinct existing sections");
    const onlyPlain=(o:typeof left)=> {
      const p=o.e.paragraph!;
      return allowed(p,["paragraphStyle","elements","bullet"])
        && p.elements.every(e=>e.textRun && allowed(e,["textRun","startIndex","endIndex"]) && allowed(e.textRun,["content","textStyle"]));
    };
    const neighbor=right??left;
    const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
    const defaultMarks={underline:false};
    const standard=target.nestingLevels.every((raw,i)=>{
      const l: Record<string,unknown>=raw;
      return allowed(l,["glyphSymbol","glyphFormat","bulletAlignment","indentStart","indentFirstLine","startNumber","textStyle"])
        && l.glyphSymbol===["●","○","■"][i%3] && (!l.glyphFormat || l.glyphFormat==="%"+i)
        && (!l.bulletAlignment || l.bulletAlignment==="START") && (!l.startNumber || l.startNumber===1)
        && (!l.textStyle || same(l.textStyle,defaultMarks))
        && ["indentStart","indentFirstLine"].every((k,n)=>!l[k] || same(l[k],{magnitude:36*(1+i)-18*n,unit:"PT"}));
    });
    if (!standard) return unsafe("cannot recreate a custom list preset");
    if (!right) {
      const ps=left.e.paragraph!.paragraphStyle??{}, level=target.nestingLevels[0] as Record<string,unknown>|undefined;
      if (!level || !allowed(ps,["namedStyleType","direction","spacingMode","indentFirstLine","indentStart"])
          || ps.spacingMode && ps.spacingMode!=="COLLAPSE_LISTS"
          || ["indentFirstLine","indentStart"].some(k=>ps[k] && !same(ps[k],level[k]))) return unsafe("last list item has extra native formatting");
    }
    if (!onlyPlain(neighbor) || right && !allowed(right.e.paragraph!.paragraphStyle??{},["namedStyleType","direction"])
        || neighbor.e.paragraph!.paragraphStyle?.direction === "RIGHT_TO_LEFT"
        || neighbor.e.paragraph!.elements.some(e=>Object.keys(e.textRun!.textStyle??{}).length)) return unsafe("destination has extra native formatting");
    const sourceId=locate(move.source).e.paragraph!.bullet?.listId;
    for (let i=0;i<move.moved.length;i++) {
      const o=locate(move.source+i), p=o.e.paragraph!, ps=p.paragraphStyle??{}, props=list(o);
      const level=props?.nestingLevels[o.block.level??0] as Record<string,unknown>|undefined;
      if (!onlyPlain(o) || !props || !level || !same(props,target) || p.bullet?.listId!==sourceId
          || !allowed(ps,["namedStyleType","direction","spacingMode","indentFirstLine","indentStart"])
          || ps.direction==="RIGHT_TO_LEFT" || ps.spacingMode && ps.spacingMode!=="COLLAPSE_LISTS"
          || ["indentFirstLine","indentStart"].some(k=>ps[k] && !same(ps[k],level[k]))) return unsafe("moved paragraph has extra native formatting");
      const bullet=p.bullet as Record<string,unknown>, chars=characters(o.block);
      if (!allowed(bullet,["listId","nestingLevel","textStyle"]) ||
          bullet.textStyle && !same(bullet.textStyle,defaultMarks) && !same(bullet.textStyle,chars.at(-1)?.style)) return unsafe("moved bullet has extra native formatting");
      let pos=0, n=0;
      for (const el of p.elements) {
        const run=el.textRun!, end=pos+run.content.length, st=run.textStyle??{};
        if (!allowed(st,["bold","italic","strikethrough","link"])) return unsafe("moved text has extra native formatting");
        for (;n<chars.length && chars[n]!.pos<end;n++) {
          if ((["bold","italic","strikethrough","link"] as const).some(k=>!same(st[k]??false,chars[n]!.style[k]??false))) return unsafe("moved text has extra native formatting");
        }
        if (run.content==="\n" && !same(st,chars.at(-1)?.style)) return unsafe("moved paragraph has a separately styled ending");
        pos=end;
      }
    }
  }
  for (const c of [...changes].reverse()) {
    const old = before.slice(c.start, c.end).map((_line, i) => locate(c.start + i));
    const added = c.replacement.map(paragraph);
    for (const [i,b] of added.entries()) {
      if (b.level === null || b.level === 0 || old.length === added.length && old[i]?.block.level === b.level && old[i]?.block.numbered === b.numbered) continue;
      const prior = after[c.next+i-1];
      const p = prior ? paragraph(prior) : null;
      if (p?.level == null || p.numbered !== b.numbered || b.level > p.level + 1) return unsafe("nested item needs a matching parent list level");
    }
    if (old.length === 1 && added.length === 1) {
      const o = old[0]!, b = added[0]!;
      editable(o, false);
      const structure = b.heading !== o.block.heading || b.level !== o.block.level || b.numbered !== o.block.numbered;
      if (structure && o.block.numbered) return unsafe("recreating an existing numbered paragraph could restart its list");
      const from = characters(o.block), to = characters(b), keep = characterMatches(from, to);
      for (const r of protectedRanges) alignProtectedSpaces(r, o.start, o.block, b, from, to, keep);
      let ai = 0, bi = 0;
      const edits: DocsRequest[][] = [];
      const previous = new Map<number,Style>();
      for (const [i,j] of keep) {
        const at = o.start + (from[ai]?.pos ?? o.block.text.length);
        const removed = (from[i]?.pos ?? o.block.text.length) - (at - o.start);
        const added = b.text.slice(to[bi]?.pos ?? b.text.length, to[j]?.pos ?? b.text.length);
        if (removed || added) {
          if (removed) guardText(at,at+removed);
          if (added) guardText(at,at);
          // Anchor the unchanged text before removing old characters.
          edits.push([
            ...(added ? [{ insertText: { location: location(at), text: added } }] : []),
            ...(removed ? [{ deleteContentRange: { range: range(at + added.length, at + added.length + removed) } }] : []),
          ]);
        }
        if (i < from.length) previous.set(j, from[i]!.style);
        ai = i+1; bi = j+1;
      }
      for (const edit of edits.reverse()) requests.push(...edit);
      const headingChanged = b.heading !== o.block.heading;
      if (headingChanged && o.e.paragraph!.paragraphStyle?.headingId) return unsafe("changing a linked heading");
      if (headingChanged && o.e.paragraph!.elements.some(el => Object.keys(el.textRun?.textStyle ?? {}).some(k => !["bold","italic","strikethrough","link"].includes(k)))) return unsafe("heading change would reset extra text styling");
      if (structure) guardText(o.start,o.end);
      setParagraph(b, o.start, !!o.e.paragraph!.bullet, structure, structure ? precedingLevel(o.start,b) : 0, headingChanged);
      // A change in paragraph style can reset native inline styling. Text
      // edits alone touch only fields whose Markdown representation changed.
      let pending: { start:number; end:number; fields:string; style:Style } | undefined;
      const flush = () => {
        if (pending) requests.push({ updateTextStyle:{ range:range(o.start+pending.start,o.start+pending.end), textStyle:pending.style, fields:pending.fields } });
        pending=undefined;
      };
      for (let j=0;j<to.length;j++) {
        const c=to[j]!, prior=previous.get(j);
        const fields=(["bold","italic","strikethrough","link"] as const).filter(k => !prior || headingChanged || JSON.stringify(prior[k]) !== JSON.stringify(c.style[k]));
        if (!fields.length) { flush(); continue; }
        const s=Object.fromEntries(fields.filter(k=>c.style[k] !== undefined || k !== "link" && b.heading !== "NORMAL_TEXT").map(k=>[k,c.style[k] ?? false]));
        const mask=fields.join(",");
        if (pending && pending.fields === mask && JSON.stringify(pending.style) === JSON.stringify(s)) pending.end=c.pos+c.text.length;
        else { flush(); pending={start:c.pos,end:c.pos+c.text.length,fields:mask,style:s}; }
      }
      flush();
      continue;
    }
    if (old.length && added.length) return unsafe("cannot replace a range of different-sized paragraph groups");
    if (old.length) {
      for (const o of old) editable(o, true);
      if (old.some((o, i) => i && old[i-1]!.end !== o.start)) return unsafe("native content between deleted paragraphs");
      let a = old[0]!.start, z = old.at(-1)!.end;
      if (z === last?.endIndex) {
        if (a === 1) return unsafe("deleting the entire document");
        const preceding = body.find(e => e.endIndex === a);
        if (!preceding?.paragraph) return unsafe("cannot delete the last paragraph after a native object");
        a--; z--;
      }
      guardText(a,z);
      requests.push({ deleteContentRange: { range: range(a, z) } });
      continue;
    }
    const right = c.start < before.length ? locate(c.start) : undefined;
    const left = c.start > 0 ? locate(c.start - 1) : undefined;
    if (left && right && left.end !== right.start) return unsafe("native content between insertion anchors");
    const sameLevel = (n: typeof left) => {
      const bullet=n?.e.paragraph?.bullet;
      if (!bullet || !n || !added.every(b => b.level===n.block.level && b.numbered===n.block.numbered && b.heading===n.block.heading)) return false;
      const level=tab.documentTab.lists?.[bullet.listId]?.listProperties.nestingLevels[bullet.nestingLevel ?? 0];
      if (!level) return unsafe("cannot determine native list preset");
      return n.block.numbered ? /^(DECIMAL|ZERO_DECIMAL|ALPHA|UPPER_ALPHA|ROMAN|UPPER_ROMAN)$/.test(level.glyphType ?? "") : !!level.glyphSymbol;
    };
    const inheritLeft=sameLevel(left), inheritRight=sameLevel(right);
    if (inheritLeft && inheritRight && left!.e.paragraph!.bullet!.listId !== right!.e.paragraph!.bullet!.listId) return unsafe("insertion is between two different native lists");
    const inherit=inheritRight || inheritLeft;
    if (!inherit && added.some(b=>b.numbered)) return unsafe("cannot insert numbered items without a matching native list paragraph");
    if (!inherit && left?.e.paragraph?.bullet && left.e.paragraph.bullet.listId === right?.e.paragraph?.bullet?.listId && left.block.numbered) return unsafe("insertion could split a numbered list");
    const append = !right && !!left;
    if (append && left!.end !== last?.endIndex || !left && right && right.start !== 1) return unsafe("native content beyond insertion anchor");
    if (!right && !left && !(last?.startIndex === 1 && last?.paragraph?.elements[0]?.textRun?.content === "\n")) return unsafe("no native insertion anchor");
    // Inserting a newline inside an existing item gives the new paragraph the
    // exact same list ID, level, glyph preset and counter. No list API call.
    const splitLeft=append || !inheritRight && inheritLeft;
    const neighbor = splitLeft ? left : right;
    if (neighbor) {
      editable(neighbor, false);
      if (!splitLeft && right?.e.paragraph?.paragraphStyle?.headingId) return unsafe("splitting a heading may move its anchor");
    }
    const at = splitLeft ? left!.end-1 : right?.start ?? 1;
    guardText(at,at);
    const text = added.map(b => b.text).join("\n");
    requests.push({ insertText: { location: location(at), text: splitLeft ? "\n" + text : right ? text + "\n" : text } });
    let pos = at + Number(splitLeft);
    let previousAdded: Block | undefined;
    for (const b of added) {
      const preceding = inherit ? 0 : previousAdded ? previousAdded.numbered === b.numbered ? previousAdded.level ?? 0 : 0 : precedingLevel(append ? left!.end : pos,b);
      setParagraph(b, pos, !!neighbor?.e.paragraph?.bullet, !inherit, preceding, (neighbor?.block.heading ?? "NORMAL_TEXT") !== b.heading);
      previousAdded=b;
      style(b, pos, true);
      pos += b.text.length + 1;
    }
  }
  return requests;
}

// Docs API omits comments. Drive's anchor is not a Docs API index; only
// quoted content can be reconciled with ranges in this exact native snapshot.
async function anchoredComments(runtime: RuntimeCapabilities, id: string, headers: Record<string,string>, tab: Tab, tabs: Tab[]): Promise<IndexedRange[]> {
  const found: IndexedRange[] = [], pages = new Set<string>();
  const locate = (t: Tab, quote: string) => {
    const ranges: IndexedRange[] = [];
    let content = "", first = 0;
    function scan() {
      for (let i = content.indexOf(quote); i !== -1; i = content.indexOf(quote,i+1)) ranges.push({startIndex:first+i,endIndex:first+i+quote.length});
      content = "";
    }
    for (const row of t.documentTab.body.content) {
      if (!row.paragraph) { scan(); continue; }
      for (const el of row.paragraph.elements) {
        const s = el.textRun?.content, start = Number(el["startIndex"] ?? row.startIndex);
        if (!s) { scan(); continue; }
        if (content && first + content.length !== start) scan();
        if (!content) first = start;
        content += s;
      }
    }
    scan(); return ranges;
  };
  let cursor = "";
  do {
    const query = new URLSearchParams({ fields: "nextPageToken,comments(anchor,quotedFileContent)", pageSize: "100", ...(cursor && {pageToken:cursor}) });
    const res = await googleRead(runtime,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"/comments?"+query,{headers,redirect:"error"});
    if (!res.ok) throw new Error("Google Drive comment check failed: HTTP "+res.status+". Block uploads require permission to read document comments.");
    const data = await res.json() as {comments?: {anchor?: string; quotedFileContent?: {mimeType?:string;value?:string}}[]; nextPageToken?:string};
    if (!Array.isArray(data.comments)) return unsafe("incomplete comment metadata");
    for (const c of data.comments) {
      if (!c.anchor && !c.quotedFileContent) continue; // Whole-file comment
      const quote = c.quotedFileContent?.value;
      const mime = c.quotedFileContent?.mimeType;
      // Drive returns text/html even for a plain-text quote. Only accept it
      // verbatim if there are no entities or tags to interpret.
      if (!quote || mime && mime !== "text/plain" && !(mime === "text/html" && !/[<&]/.test(quote))) return unsafe("comment has no mappable quoted text");
      const matches = locate(tab,quote);
      if (!matches.length && !tabs.some(t=>t !== tab && locate(t,quote).length)) return unsafe("cannot locate an anchored comment");
      found.push(...matches);
    }
    cursor = data.nextPageToken ?? "";
    if (cursor && pages.has(cursor)) return unsafe("repeated comment page token");
    pages.add(cursor);
  } while(cursor);
  return found;
}

export async function tryUploadDocBlocks(runtime: RuntimeCapabilities, documentId: string, key: string | null, tabId: string | null, remoteMarkdown: string, desiredMarkdown: string, confirmRemote: (revision: string) => Promise<string>, wroteRevision?: (revision: string) => void, positionRevision?: string): Promise<boolean> {
  const token = (await nativeDocsGrant(runtime))?.token;
  if (!token) return false;
  const url = "https://docs.googleapis.com/v1/documents/" + encodeURIComponent(documentId);
  const headers = { authorization: "Bearer " + token, ...(key && { "X-Goog-Drive-Resource-Keys": documentId + "/" + key }) };
  const response = await googleRead(runtime, url + "?includeTabsContent=true&suggestionsViewMode=SUGGESTIONS_INLINE", { headers, redirect: "error" });
  if (!response.ok) throw new Error("Google Docs block read failed: HTTP " + response.status);
  const data = await response.json() as { documentId?: string; revisionId?: string; tabs?: Tab[] };
  if (data.documentId !== documentId || !data.revisionId) return unsafe("missing document identity or revision");
  const tabs: Tab[] = [];
  function visit(items: Tab[]) { for (const t of items) { tabs.push(t); visit(t.childTabs ?? []); } }
  visit(data.tabs ?? []);
  if (!tabId && tabs.length > 1) return unsafe("this document has multiple tabs; sync the URL with an explicit tab ID");
  const tab = tabId ? tabs.find(t => t.tabProperties.tabId === tabId) : tabs[0];
  if (!tab?.documentTab?.body?.content) return unsafe("missing target tab");
  const comments = await anchoredComments(runtime,documentId,headers,tab,tabs);
  const requests = plan(tab, remoteMarkdown, desiredMarkdown,comments,positionRevision === data.revisionId);
  if (await confirmRemote(data.revisionId) !== remoteMarkdown) throw new Error("Google Docs changed before writing; sync again.");
  if (!requests.length) return true;
  const update = await runtime.http.request(url + ":batchUpdate", { method: "POST", headers: { ...headers, "content-type": "application/json" }, redirect: "error", body: JSON.stringify({ writeControl: { requiredRevisionId: data.revisionId }, requests }) });
  if (!update.ok) throw new Error("Google Docs block update failed: HTTP " + update.status + ". Sync again to check the current revision.");
  if (wroteRevision) {
    const ack = await update.json() as { writeControl?: { requiredRevisionId?: string } };
    if (typeof ack.writeControl?.requiredRevisionId === "string") wroteRevision(ack.writeControl.requiredRevisionId);
  }
  return true;
}
