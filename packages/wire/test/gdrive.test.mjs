import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { PdfDocument } from "@poe-platform/safe-bash/pdf-ast";
import { pdfMarkdown } from "../dist/adapters/drive-pdf.js";
import { scrapeDrive } from "../dist/adapters/gdrive.js";

test("review scale options stay separate from the selected answer and visibility note", () => {
  const doc = PdfDocument.create();
  const cover = doc.addPage();
  for (const [i, s] of [
    "Example",
    "MANAGER VERSION",
    "DO NOT SHARE",
    "TABLE OF CONTENTS",
    "RESPONSES OVERVIEW",
    "By question",
  ].entries()) {
    cover.drawText(s, { x: 30, y: 700 - i * 30, size: 12 });
  }
  const p = doc.addPage();
  for (const [s, x, y, size] of [
    ["Responses overview by question", 30, 750, 18],
    ["1. Example question?", 30, 700, 12],
    ["Manager", 200, 670, 9],
    ["Off target   On target", 100, 640, 9],
    ["AB", 35, 600, 9],
    ["Alex B", 60, 600, 11],
    ["Manager", 100, 600, 9],
    ["RATING", 73, 570, 9],
    ["On target", 79, 550, 9],
    ["2. Feedback?", 30, 500, 12],
    ["Your response will only be visible to the manager", 30, 475, 9],
  ])
    p.drawText(s, { x, y, size });
  const md = pdfMarkdown(doc.save());
  assert.match(md, /### 1\. Example question\?\n\n#### Alex B Manager\n\n\*\*RATING\*\*\n\nOn target/);
  assert.match(md, /\*Your response will only be visible to the manager\*/);
  assert.doesNotMatch(md, /Off target/);
});

test("scrape paginates nested files, exports whole sheets and protects local edits", async () => {
  const dir = await mkdtemp(join(import.meta.dirname, "gdrive-"));
  const google = "application/vnd.google-apps.";
  const exports = [];
  const runtime = {
    googleFormsTokens: { load: async () => ({ token: "saved" }) },
    http: {
      request: async (input, init) => {
        assert.equal(init.headers.authorization, "Bearer saved");
        const u = new URL(input),
          id = u.pathname.split("/").pop();
        if (id === "source") return Response.json({ name: basename(dir), mimeType: google + "folder" });
        if (id === "export") {
          exports.push(u.searchParams.get("mimeType"));
          return new Response("download");
        }
        const parent = u.searchParams.get("q").split("'")[1];
        const item = (id, name, kind) => ({ id, name, mimeType: google + kind, version: "1" });
        return Response.json(
          parent === "source"
            ? { files: [item("nested", "Team", "folder")] }
            : u.searchParams.has("pageToken")
              ? { files: [item("doc", "Notes", "document")] }
              : { files: [item("sheet", "Scores", "spreadsheet")], nextPageToken: "2" },
        );
      },
    },
  };
  try {
    assert.match(await scrapeDrive(runtime, dir, "https://drive.google.com/drive/folders/source"), /2 downloaded/);
    assert.deepEqual(exports, ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/markdown"]);
    assert.match(await scrapeDrive(runtime, dir), /2 unchanged/);
    const path = join(dir, "Team", "Notes.md");
    await writeFile(path, "local edits");
    await assert.rejects(scrapeDrive(runtime, dir), /Local file changed/);
    assert.equal(await readFile(path, "utf8"), "local edits");
    assert.equal(exports.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
