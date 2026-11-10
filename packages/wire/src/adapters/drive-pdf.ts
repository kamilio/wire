import { PdfDocument, dictGet } from "#pdf-reader";

export function pdfMarkdown(bytes: Uint8Array): string | null {
  const doc = PdfDocument.load(bytes);
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
