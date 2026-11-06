import domino from "@mixmark-io/domino";
import { decodeHTML } from "entities";
import TurndownService from "turndown";

const mention = '[data-type="mention"], [data-mention]';
function mentionLabel(node: HTMLElement): string {
  return node.getAttribute("data-label") || node.getAttribute("data-mention") || "";
}

const html = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  hr: "---",
});
html.remove(["script", "style"]);
html.keep("u");
html.addRule("strike", {
  filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: (text) => `~~${text}~~`,
});
html.addRule("styled text", {
  filter: (node) => node.tagName === "SPAN" && node.hasAttribute("style"),
  replacement: (text, node) => {
    const style = node.getAttribute("style")!;
    if (/font-weight:\s*(?:bold|[6-9]00)/i.test(style)) text = `**${text}**`;
    if (/font-style:\s*italic/i.test(style)) text = `*${text}*`;
    if (/text-decoration[^:]*:[^;]*line-through/i.test(style)) text = `~~${text}~~`;
    return text;
  },
});
html.addRule("table", {
  filter: "table",
  replacement: (_, table) => {
    const rows = Array.from(table.querySelectorAll("tr"), (row) =>
      Array.from(row.children, (cell) =>
        html.turndown(cell.innerHTML).replace(/\|/g, "\\|").replace(/\n+/g, "<br>"),
      ),
    );
    if (!rows.length) return "";
    rows.splice(
      1,
      0,
      rows[0]!.map(() => "---"),
    );
    return "\n\n" + rows.map((cells) => "| " + cells.join(" | ") + " |").join("\n") + "\n\n";
  },
});

function convert(value: string): string {
  const outsideCode = value.replace(/(`+)[\s\S]*?\1/g, "");
  if (
    /<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|span|strong|em|b|i|s|strike|del|u|a|img|code|hr|script|style)(?:\s|\/?>)/i.test(
      outsideCode,
    )
  ) {
    const document = domino.createDocument();
    document.body.innerHTML = value;
    for (const node of Array.from(document.body.querySelectorAll<HTMLElement>(mention))) {
      if (!node.textContent?.trim()) node.textContent = mentionLabel(node);
    }
    for (const node of Array.from(document.body.querySelectorAll("a[href], img[src]"))) {
      const attr = node.tagName === "A" ? "href" : "src";
      if (/^(?:javascript|data|vbscript):/i.test(node.getAttribute(attr)!.replace(/\s+/g, "")))
        node.removeAttribute(attr);
    }
    return html.turndown(document.body);
  }
  return decodeHTML(
    value.replace(/(`+)[\s\S]*?\1|<br\s*\/?\s*>/gi, (match) => (match.startsWith("<") ? "  \n" : match)),
  ).trim();
}

export function richText(value: string): string {
  let fence = "";
  const lines: string[] = [];
  for (const line of convert(value).split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fence && !line.trim() && lines.at(-1) === "") continue;
    lines.push(!fence && !line.trim() ? "" : line);
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length)))
      fence = fence ? "" : marker;
  }
  return lines.join("\n");
}
