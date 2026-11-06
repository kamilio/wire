import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { marked, type Token, type Tokens } from "marked";

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Target = "task" | "comment" | "field";

export function asanaRichText(markdown: string, target: Target): string {
  const render = (tokens: Token[]): string => tokens.map(token).join("");
  const blocks = (tokens: Token[]): string => tokens.filter((t) => t.type !== "space" && t.type !== "def").map(token).join("\n\n");
  function token(t: Token): string {
    switch (t.type) {
      case "paragraph": return render(t.tokens!);
      case "text": return t.tokens ? render(t.tokens!) : xml(t.text);
      case "escape": return xml(t.text);
      case "html": return /^<\/?u>$/.test(t.text) ? t.text : xml(t.text);
      case "br": return "\n";
      case "strong": case "em": return `<${t.type}>${render(t.tokens!)}</${t.type}>`;
      case "del": return `<s>${render(t.tokens!)}</s>`;
      case "codespan": return `<code>${xml(t.text)}</code>`;
      case "code": return `<pre${t.lang ? ` data-language="${xml(t.lang)}"` : ""}>${xml(t.text)}</pre>`;
      case "blockquote": return `<blockquote>${blocks(t.tokens!)}</blockquote>`;
      case "heading": {
        const tag = target === "task" && t.depth <= 2 ? `h${t.depth}` : "strong";
        return `<${tag}>${render(t.tokens!)}</${tag}>`;
      }
      case "hr": return target === "task" ? "<hr/>" : "———";
      case "list": {
        const tag = t.ordered ? "ol" : "ul";
        return `<${tag}>${t.items.map((item: Tokens.ListItem) => `<li>${render(item.tokens)}</li>`).join("")}</${tag}>`;
      }
      case "checkbox": return t.checked ? "☑ " : "☐ ";
      case "space": return "\n\n";
      case "link": case "image": {
        const gid = /^asana:(\d+)$/.exec(t.title ?? "")?.[1] ?? /^asana:\/\/(\d+)$/.exec(t.href)?.[1];
        if (t.type === "image" && gid && target === "task") return `<img data-asana-gid="${gid}"/>`;
        if (gid) return `<a data-asana-gid="${gid}"></a>`;
        if (!/^(?:https?:\/\/|mailto:)/i.test(t.href)) throw new Error("Asana links need an absolute HTTP, HTTPS, or mailto URL.");
        return `<a href="${xml(t.href)}">${t.type === "image" ? xml(t.text || t.href) : render(t.tokens!)}</a>`;
      }
      case "table": {
        if (target !== "task") throw new Error("Asana supports Markdown tables in task descriptions only.");
        return "<table>" + [t.header, ...t.rows].map((row: Tokens.TableCell[]) => "<tr>" + row.map((cell) => `<td>${render(cell.tokens)}</td>`).join("") + "</tr>").join("") + "</table>";
      }
      default: return xml(t.raw);
    }
  }
  const html = `<body>${blocks(marked.lexer(markdown))}</body>`;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(html)) throw new Error("Asana rich text cannot contain XML control characters.");
  // Raw underline tags are allowed in Markdown, so validate their nesting.
  if (/<\/?u>/.test(html)) new DOMParser({ onError: () => { throw new Error("Unbalanced underline tags in Markdown."); } }).parseFromString(html, "application/xml");
  return html;
}

function literal(value: string): string {
  return value.replace(/([\\`*_\[\]~<>])/g, "\\$1").replace(/^(\s*)(#{1,6}|[-+=>])(?=\s)/gm, "$1\\$2").replace(/^(\s*\d+)([.)])(?=\s)/gm, "$1\\$2");
}

export function asanaMarkdown(html: string): string {
  const root = new DOMParser().parseFromString(html, "application/xml").documentElement!;
  // Asana may supply its own newlines around block elements. Keep whichever
  // boundary is wider rather than adding both to the Markdown.
  const children = (node: Node): string => Array.from(node.childNodes ?? []).map(render).reduce((before, after) => {
    const overlap = Math.min(before.match(/\n*$/)![0].length, after.match(/^\n*/)![0].length);
    return before + after.slice(overlap);
  }, "");
  function render(node: Node): string {
    if (node.nodeType === 3 || node.nodeType === 4) return literal(node.nodeValue ?? "");
    if (node.nodeType !== 1) return "";
    const el = node as Element;
    const content = () => children(el);
    switch (el.tagName) {
      case "strong": case "b": return `**${content()}**`;
      case "em": case "i": return `*${content()}*`;
      case "s": return `~~${content()}~~`;
      case "u": return `<u>${content()}</u>`;
      case "br": return "\n";
      case "a": case "img": {
        const gid = el.getAttribute("data-asana-gid");
        const href = el.getAttribute("href") || (gid ? `asana://${gid}` : el.getAttribute("src"));
        if (!href) return content();
        return `${el.tagName === "img" ? "!" : ""}[${content() || gid || "link"}](${href.replace(/[()\s<>]/g, c => "%" + c.charCodeAt(0).toString(16))}${gid && el.hasAttribute("href") ? ` "asana:${gid}"` : ""})`;
      }
      case "code": case "pre": {
        const text = el.textContent ?? "";
        const fence = "`".repeat(Math.max(el.tagName === "pre" ? 3 : 1, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
        if (el.tagName === "pre") return `\n\n${fence}${el.getAttribute("data-language") ?? ""}\n${text}\n${fence}\n\n`;
        const pad = /^`|`$/.test(text) || /^ .* $/.test(text) && /\S/.test(text) ? " " : "";
        return `${fence}${pad}${text}${pad}${fence}`;
      }
      case "h1": case "h2": return `\n\n${el.tagName === "h1" ? "#" : "##"} ${content()}\n\n`;
      case "hr": return "\n\n---\n\n";
      case "blockquote": return "\n\n" + content().trim().split("\n").map(line => "> " + line).join("\n") + "\n\n";
      case "ul": case "ol": {
        const rows = Array.from(el.childNodes).filter(item => item.nodeName === "li").map((li, i) => {
          const prefix = el.tagName === "ol" ? `${i + 1}. ` : "- ";
          return prefix + children(li).trim().replace(/\n/g, "\n" + " ".repeat(prefix.length));
        });
        return "\n" + rows.join("\n") + "\n";
      }
      case "table": {
        const rows = Array.from(el.getElementsByTagName("tr")).map(row => Array.from(row.getElementsByTagName("td")).map(cell => children(cell).replace(/\|/g, "\\|").replace(/\n/g, " ")));
        if (!rows.length) return "";
        rows.splice(1, 0, rows[0]!.map(() => "---"));
        return "\n\n" + rows.map(row => "| " + row.join(" | ") + " |").join("\n") + "\n\n";
      }
      default: return content();
    }
  }
  return children(root).trim();
}
