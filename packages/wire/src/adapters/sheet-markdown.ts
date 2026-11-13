import type { RuntimeCapabilities } from "wire-core";

type Cell = {
  formattedValue?: string; hyperlink?: string;
  userEnteredValue?: { stringValue?: string; formulaValue?: string };
  textFormatRuns?: { startIndex?: number; format?: { link?: { uri?: string } } }[];
  userEnteredFormat?: { textFormat?: { link?: { uri?: string } } };
  chipRuns?: { startIndex?: number; chip?: { richLinkProperties?: { uri?: string } } }[];
};
type Tab = { properties: { title: string }; data?: { startRow?: number; startColumn?: number; rowData?: { values?: Cell[] }[] }[] };

export async function readSheetTabs(runtime: Pick<RuntimeCapabilities, "googleFormsTokens" | "http">, id: string): Promise<Tab[]> {
  const fields = "sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,hyperlink,userEnteredValue,textFormatRuns(startIndex,format/link),userEnteredFormat/textFormat/link,chipRuns(startIndex,chip/richLinkProperties/uri)))))";
  const token = await runtime.googleFormsTokens.load();
  const response = await runtime.http.request("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "?" + new URLSearchParams({ fields }), { headers: { authorization: "Bearer " + token.token } });
  if (!response.ok) throw new Error("Sheets HTTP " + response.status + ": " + (await response.text()).slice(0, 600));
  const { sheets } = await response.json() as { sheets: Tab[] };
  return sheets;
}

const literal = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/([\\*`_~\[\]])/g, "\\$1").replace(/\|/g, "&#124;").replace(/\r\n?|\n/g, "<br>");
function linked(label: string, url?: string) {
  if (!url || !/^(?:https?:\/\/|mailto:|#)/i.test(url)) return literal(label);
  const target = url.replace(/[\s<>|()\\]/g, c => encodeURIComponent(c).replace("(", "%28").replace(")", "%29"));
  return "[" + literal(label) + "](" + target + ")";
}
function cellText(cell: Cell) {
  const text = cell.formattedValue ?? cell.userEnteredValue?.stringValue ?? "";
  if (!text) return "";
  const fullLink = cell.hyperlink ?? cell.userEnteredFormat?.textFormat?.link?.uri;
  const formulaLink = /^=HYPERLINK\(\s*"([^"]+)"/i.exec(cell.userEnteredValue?.formulaValue ?? "")?.[1];
  const entered = cell.userEnteredValue?.stringValue;
  const chips = (cell.chipRuns ?? []).filter(r => r.chip?.richLinkProperties?.uri);
  if (chips.length && entered === text) {
    // Some older Sheets use chip start/end runs over the full displayed title.
    const runs = cell.chipRuns!;
    let result = literal(text.slice(0, runs[0]?.startIndex ?? 0));
    for (const [i, run] of runs.entries()) result += linked(text.slice(run.startIndex ?? 0, runs[i + 1]?.startIndex ?? text.length), run.chip?.richLinkProperties?.uri);
    return result;
  }
  if (chips.length && entered !== undefined) {
    // Chips occupy one @ in the raw string but expand to a title in the displayed value.
    // Use the text between chips as boundaries; preserve the display text on ambiguity.
    let rawAt = 0, displayAt = 0, result = "";
    for (const [i, chip] of chips.entries()) {
      const at = chip.startIndex ?? 0, prefix = entered.slice(rawAt, at), nextAt = chips[i + 1]?.startIndex ?? entered.length;
      const suffix = entered.slice(at + 1, nextAt);
      if (entered[at] !== "@" || !text.startsWith(prefix, displayAt) || (!suffix && i + 1 < chips.length)) break;
      displayAt += prefix.length;
      const end = i + 1 === chips.length ? text.length - suffix.length : text.indexOf(suffix, displayAt);
      if (end < displayAt || !text.startsWith(suffix, end)) break;
      result += literal(prefix) + linked(text.slice(displayAt, end), chip.chip?.richLinkProperties?.uri);
      displayAt = end; rawAt = at + 1;
      if (i + 1 === chips.length) return result + literal(suffix);
    }
  }
  const runs = cell.textFormatRuns ?? [];
  if (runs.some(r => r.format?.link?.uri)) {
    let result = linked(text.slice(0, runs[0]?.startIndex ?? 0), fullLink);
    for (const [i, run] of runs.entries()) result += linked(text.slice(run.startIndex ?? 0, runs[i + 1]?.startIndex ?? text.length), run.format?.link?.uri ?? cell.userEnteredFormat?.textFormat?.link?.uri);
    return result;
  }
  return linked(text, fullLink ?? formulaLink ?? (chips.length === 1 ? chips[0]?.chip?.richLinkProperties?.uri : undefined));
}

export function sheetMarkdown(tabs: Tab[]) {
  const blocks: string[] = [];
  for (const tab of tabs) {
    const rows: string[][] = [];
    let width = 1;
    for (const grid of tab.data ?? []) {
      for (const [r, row] of (grid.rowData ?? []).entries()) for (const [c, cell] of (row.values ?? []).entries()) {
        const value = cellText(cell);
        if (!value && !cell.userEnteredValue?.formulaValue) continue;
        const col = c + (grid.startColumn ?? 0);
        (rows[r + (grid.startRow ?? 0)] ??= [])[col] = value;
        width = Math.max(width, col + 1);
      }
    }
    const lines = ["## " + literal(tab.properties.title), ""];
    for (let r = 0; r < Math.max(1, rows.length); r++) {
      lines.push("| " + Array.from({ length: width }, (_, c) => rows[r]?.[c] ?? "").join(" | ") + " |");
      if (!r) lines.push("| " + Array(width).fill("---").join(" | ") + " |");
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n") + "\n";
}
