import { spawnSync } from "node:child_process";
import { PdfDocument, dictGet } from "#pdf-reader";

export function pdfMarkdown(bytes: Uint8Array): string | null {
  return markdownFrom(PdfDocument.load(bytes));
}

function markdownFrom(doc: PdfDocument): string | null {
  const lines = (i: number) => doc.extractPage(i, "raw").blocks.flatMap((b) => b.lines);
  const cover = lines(0).map((l) => l.text);
  const toc = cover.indexOf("TABLE OF CONTENTS");
  if (toc < 1 || !(cover.includes("RESPONSES OVERVIEW") || cover.includes("MANAGER REVIEW"))) {
    const text = doc.extractText({ mode: "logical" }).replace(/\f/g, "\n\n").trim();
    return text ? text + "\n" : null;
  }

  // Some older packets specify MacRoman without a Unicode map. Decode the
  // original character code only for those fonts; other encodings stay intact.
  const macFonts = new Set<string>();
  for (const { value } of doc.cos.objects.values()) {
    if (value.kind !== "dict" || dictGet(value, "ToUnicode")) continue;
    const encoding = dictGet(value, "Encoding"),
      name = dictGet(value, "BaseFont");
    if (encoding?.kind === "name" && encoding.decoded === "MacRomanEncoding" && name?.kind === "name")
      macFonts.add(name.decoded);
  }
  const decoder = new TextDecoder("macintosh");
  const out = ["# " + cover[0], ...cover.slice(1, toc).map((s) => "**" + s + "**")];
  let lastY = 0,
    question = false,
    scale = false,
    privateQuestion = false;
  let byQuestion = false;
  for (let i = 1; i < doc.pageCount; i++) {
    for (const line of lines(i)) {
      const [x, y] = line.bbox;
      const size = line.words[0]?.fontSize;
      const s = line.words
        .map((word) =>
          word.glyphs
            .map((glyph, i, glyphs) => {
              const prev = glyphs[i - 1];
              const breakAfterLabel =
                prev &&
                /bold/i.test(prev.fontName) &&
                !/bold/i.test(glyph.fontName) &&
                /[a-z]$/.test(prev.unicode) &&
                /^[A-Z]/.test(glyph.unicode);
              const wordGap =
                prev &&
                glyph.bbox[0] - prev.bbox[2] > glyph.fontSize * 0.14 &&
                /[\p{L}\p{N}]$/u.test(prev.unicode) &&
                /^[\p{L}\p{N}]/u.test(glyph.unicode);
              const text =
                glyph.charCode >= 128 &&
                glyph.charCode <= 255 &&
                macFonts.has(glyph.fontName) &&
                glyph.unicode === String.fromCharCode(glyph.charCode)
                  ? decoder.decode(Uint8Array.of(glyph.charCode))
                  : glyph.unicode;
              return (breakAfterLabel || wordGap ? " " : "") + text;
            })
            .join(""),
        )
        .join(" ")
        .trim();
      if (y < 52 || !s) continue; // Running footer in the review export.
      if (s === "Manager version only") {
        privateQuestion = true;
        continue;
      }
      if (size !== undefined && size >= 17 && Math.abs(x - 30) < 1) {
        byQuestion = s === "Responses overview by question";
        out.push("## " + s);
        question = scale = false;
      } else if (Math.abs(x - 30) < 1 && size !== undefined && Math.abs(size - 12) < 0.6 && /^\d+\. /.test(s)) {
        if (privateQuestion) out.push("**Manager version only**");
        privateQuestion = false;
        out.push("### " + s);
        question = true;
        scale = false;
      } else if (question && Math.abs(x - 30) < 1 && size !== undefined && Math.abs(size - 12) < 0.6) {
        out[out.length - 1] += " " + s;
      } else if (
        (Math.abs(x - 60) < 1.5 || (x >= 30 && x < 60 && /^[A-Z]{1,4}$/.test(line.words[0]!.text))) &&
        /\s(Self|Manager|Peer|Direct report|Upward)$/i.test(s)
      ) {
        const words = line.words.filter((w) => w.bbox[0] >= 58);
        out.push("#### " + words.map((w) => w.text).join(" "));
        question = scale = false;
      } else if (byQuestion && question && s === "Manager") {
        // The scale repeats the selected value in the reviewer's RATING card.
        scale = true;
      } else if (!scale) {
        const label = s === "MULTIPLE CHOICE" || s === "RATING";
        if (Math.abs(x - 30) < 1 && s.startsWith("Your response ")) out.push("*" + s + "*");
        else if (label) out.push("**" + s + "**");
        else if (/^[•◦▪]\s*/.test(s)) {
          const bullet = s.replace(/^[•◦▪]\s*/, s.startsWith("◦") ? "  - " : "- ");
          if (/^(?:- |  - )/m.test(out.at(-1)!)) out[out.length - 1] += "\n" + bullet;
          else out.push(bullet);
        } else if (question || lastY - y > 21 || /^\d+[.)]\s/.test(s) || /^#|^\*\*/.test(out.at(-1)!)) out.push(s);
        else out[out.length - 1] += " " + s;
        question = false;
      }
      lastY = y;
    }
  }
  return out.join("\n\n") + "\n";
}

// Deletion requires independent, warning-free extraction. Missing verification tools
// never prevent preview or conversion; they only mean the original stays on disk.
export function verifiedPdf(bytes: Uint8Array, markdown: string): boolean {
  try {
    let warned = false;
    const doc = PdfDocument.load(bytes, {
      recovery: "strict",
      onWarning: () => {
        warned = true;
      },
    });
    if (markdownFrom(doc) !== markdown || warned) return false;
    const result = spawnSync("pdftotext", ["-raw", "-enc", "UTF-8", "-", "-"], {
      input: bytes,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error || result.status !== 0 || result.stderr || !result.stdout.endsWith("\f")) return false;
    const pages = result.stdout
      .slice(0, -1)
      .split("\f")
      .map((s) => s.trim().split(/\r?\n/));
    if (pages.length !== doc.pageCount || pages.some((lines) => !lines.join("").trim())) return false;
    const cover = pages[0]!;
    const review =
      cover.includes("MANAGER VERSION") && cover.includes("DO NOT SHARE") && cover.includes("TABLE OF CONTENTS");
    for (const { value } of doc.cos.objects.values()) {
      const d = value.kind === "stream" ? value.dict : value.kind === "dict" ? value : null;
      if (!d) continue;
      if (
        ["EmbeddedFiles", "EF", "AcroForm", "XFA", "RichMediaContent", "Collection", "OCProperties"].some((k) =>
          dictGet(d, k),
        )
      )
        return false;
      const sub = dictGet(d, "Subtype"),
        type = dictGet(d, "Type");
      if (type?.kind === "name" && type.decoded === "Annot" && !(sub?.kind === "name" && sub.decoded === "Link"))
        return false;
    }
    for (let i = 0; i < pages.length; i++) {
      const display = doc.getPage(i).evaluateDisplayList();
      if (!display.glyphs.length || (!review && display.paths.length)) return false;
      if (display.annotations.some((a) => a.contents || (a.uri && !/^#page\d+$/.test(a.uri) && !markdown.includes(a.uri))))
        return false;
      // Lattice's small square reviewer avatars are decorative. Keep other images.
      if (
        display.images.some(
          (img) =>
            !(
              review &&
              img.width === 200 &&
              img.height === 200 &&
              img.matrix[0] >= 22 &&
              img.matrix[0] <= 24.1 &&
              img.matrix[1] === 0 &&
              img.matrix[2] === 0 &&
              Math.abs(img.matrix[3] - img.matrix[0]) < 0.1 &&
              Math.abs(img.matrix[4] - 30) < 1
            ),
        )
      )
        return false;
    }
    if (warned || /\uFFFD|[\x00-\x08\x0e-\x1f]/u.test(markdown)) return false;
    const compact = (s: string) => s.normalize("NFKC").replace(/\s+/gu, "");
    if (!review) return pages.flat().join(" ").trim().replace(/\s+/gu, " ") === markdown.trim().replace(/\s+/gu, " ");
    // Only omit the known navigation, running feet, avatar initials and duplicated
    // scale options. Any other character difference keeps the PDF.
    const toc = cover.indexOf("TABLE OF CONTENTS");
    if (
      !/^RESPONSES OVERVIEW\nBy question\s*\.+\s*\d+(?:\nCLOSING\nAcknowledgement\s*\.+\s*\d+)?(?:\n1)?$/.test(
        cover.slice(toc + 1).join("\n"),
      )
    )
      return false;
    const source = [...cover.slice(0, toc)];
    for (let i = 1; i < pages.length; i++) {
      const lines = pages[i]!,
        footer = lines.lastIndexOf(cover[0]!);
      if (
        footer < 0 ||
        (compact(lines.slice(footer + 1).join("")) !==
          compact(cover[1]! + "Manager versionResponses overview by question" + (i + 1)) &&
          compact(lines.slice(footer + 1).join("")) !== compact(cover[1]! + "Manager versionAcknowledgement" + (i + 1)))
      )
        return false;
      const body = lines
        .slice(0, footer)
        .join("\n")
        .replace(
          /^Manager\n(Critically underperform-\s*ing\s+Needs Improvement\s+Performing\s+Exceeding|No, not at this time\s+Yes, I’m proposing this person for promotion|Needs improvement\s+On track)\n(?=[^\n]+Manager\nRATING\n)/gm,
          "",
        )
        .replace(/^[A-Z]{1,4} (?=.+ (?:Self|Manager|Peer|Direct report|Upward)$)/gm, "")
        .replace(/^\s*[•◦▪]\s*/gm, "");
      if (!body.trim()) return false;
      source.push(body);
    }
    const plain = markdown
      .split("\n")
      .map((l) =>
        l
          .replace(/^#{1,4} /, "")
          .replace(/^\s*- /, "")
          .replace(/^\*\*(.+)\*\*$/, "$1")
          .replace(/^\*(Your response .+)\*$/, "$1"),
      )
      .join("\n");
    return compact(source.join("\n")) === compact(plain);
  } catch {
    return false;
  }
}
