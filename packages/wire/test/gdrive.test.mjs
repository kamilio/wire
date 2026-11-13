import { zip } from "./support/zip.mjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
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
        if (u.hostname === "sheets.googleapis.com") return Response.json({ sheets: [{ properties: { title: "Scores" }, data: [{ rowData: [{ values: [{ formattedValue: "Score" }] }, { values: [{ formattedValue: "84%" }] }] }] }] });
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
    assert.equal(await readFile(join(dir, "Team", "Scores.md"), "utf8"), "## Scores\n\n| Score |\n| --- |\n| 84% |\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verified PDFs stay Markdown-only on refresh; edits, missing copies and warned conversions are protected", async (t) => {
  if (spawnSync("pdftotext", ["-v"]).status !== 0) return t.skip("Independent PDF verifier not installed");
  const dir = await mkdtemp(join(import.meta.dirname, "gdrive-"));
  const doc = PdfDocument.create();
  doc.addPage().drawText("Keep this response", { x: 30, y: 600, size: 12 });
  let bytes = doc.save(),
    version = "1",
    media = 0;
  const runtime = {
    googleFormsTokens: { load: async () => ({ token: "saved" }) },
    http: {
      request: async (input) => {
        const u = new URL(input);
        if (u.searchParams.has("alt")) {
          media++;
          return new Response(bytes);
        }
        return Response.json(
          u.pathname.endsWith("/source")
            ? { name: basename(dir), mimeType: "application/vnd.google-apps.folder" }
            : { files: [{ id: "p", name: "packet.pdf", mimeType: "application/pdf", version }] },
        );
      },
    },
  };
  const path = join(dir, "packet.pdf"),
    md = join(dir, "packet.md");
  try {
    await scrapeDrive(runtime, dir, "https://drive.google.com/drive/folders/source");
    assert.deepEqual(await readFile(path), Buffer.from(bytes));
    assert.match(await scrapeDrive(runtime, dir, undefined, true), /removed 1 local PDF/);
    await assert.rejects(readFile(path), { code: "ENOENT" });
    assert.match(await readFile(md, "utf8"), /Keep this response/);
    await scrapeDrive(runtime, dir);
    assert.equal(media, 1);
    await writeFile(md, "my edit");
    await assert.rejects(scrapeDrive(runtime, dir), /Local file changed/);
    assert.equal(await readFile(md, "utf8"), "my edit");
    await rm(md);
    await scrapeDrive(runtime, dir);
    assert.equal(media, 2);
    // Also clean an existing installation with both files, without refetching.
    const manifest = join(dir, ".wire-gdrive.json"),
      state = JSON.parse(await readFile(manifest));
    delete state.entries["./packet.pdf"].markdownOnly;
    await writeFile(manifest, JSON.stringify(state));
    await writeFile(path, bytes);
    await scrapeDrive(runtime, dir, undefined, true);
    await assert.rejects(readFile(path), { code: "ENOENT" });
    assert.equal(media, 2);
    const figure = doc.addPage();
    figure.drawRect({ x: 10, y: 10, width: 100, height: 100 });
    bytes = doc.save();
    version = "2";
    await scrapeDrive(runtime, dir, undefined, true);
    assert.deepEqual(await readFile(path), Buffer.from(bytes));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Google Docs images are local private attachments, repaired when missing and never overwritten", async () => {
  const dir = await mkdtemp(join(import.meta.dirname, "gdrive-"));
  const google = "application/vnd.google-apps.";
  const data = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAIAAAD0PzoJAAAAEElEQVR4nGP8z4AOmDBEGAAlTQEDFimLUAAAAABJRU5ErkJggg==", "base64");
  const hash = createHash("sha256").update(data).digest("hex");
  const preview = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
  const uri = "data:image/png;base64," + preview.toString("base64");
  const text = "First ![Chart][image1] then ![](" + uri + ")\n\n[image1]: <" + uri + ">\n";
  const other = Buffer.from("R0lGODdhAwADAIEAAP8AAAAAAAAAAAAAACwAAAAAAwADAAAIBwABCBw4MCAAOw==", "base64");
  const otherHash = createHash("sha256").update(other).digest("hex");
  const originalName = "images/image10.png", secondName = "images/image2.gif";
  let docsImages = [originalName, secondName];
  let downloads = 0, archives = 0;
  const runtime = {
    googleFormsTokens: { load: async () => ({ token: "saved" }) },
    http: { request: async input => {
      const u = new URL(input);
      if (u.pathname.endsWith("/export")) {
        if (u.searchParams.get("mimeType") === "application/zip") {
          archives++;
          return new Response(zip({ [secondName]: other, [originalName]: data,
            "Notes.html": docsImages.map(name => '<img src="' + name + '">').join("") }));
        }
        downloads++;
        return new Response(text);
      }
      return Response.json(u.pathname.endsWith("/source") ? { name: basename(dir), mimeType: google + "folder" }
        : {files:[{id:"d", name:"Team (old)", mimeType:google+"document", version:"1"}]});
    } },
  };
  const note = join(dir, "Team (old).md"), folder = join(dir, "attachments", "Team (old)"), image = join(folder, hash + ".png");
  try {
    await scrapeDrive(runtime, dir, "https://drive.google.com/drive/folders/source");
    const md = await readFile(note, "utf8");
    const url = "attachments/Team%20%28old%29/" + hash + ".png";
    assert.equal(md.trim(), "First ![Chart](" + url + ") then ![](attachments/Team%20%28old%29/" + otherHash + ".gif)");
    assert.deepEqual((await readdir(folder)).sort(), [hash + ".png", otherHash + ".gif"].sort());
    assert.equal(archives, 1);
    assert.deepEqual(await readFile(image), data);
    await scrapeDrive(runtime, dir);
    assert.equal(downloads, 1);
    await rm(image);
    await scrapeDrive(runtime, dir);
    assert.equal(downloads, 2);
    assert.deepEqual(await readFile(image), data);
    await writeFile(image, "local edit");
    await assert.rejects(scrapeDrive(runtime, dir), /Local attachment changed/);
    assert.equal(await readFile(image, "utf8"), "local edit");
    await rm(image);
    // Older managed exports upgrade in place without another download.
    const manifest = join(dir, ".wire-gdrive.json"), state = JSON.parse(await readFile(manifest));
    await writeFile(note, text);
    const entry = state.entries["./team (old).md"];
    delete entry.images;
    entry.hash = createHash("sha256").update(text).digest("hex");
    await writeFile(manifest, JSON.stringify(state));
    await scrapeDrive(runtime, dir);
    assert.equal(await readFile(note, "utf8"), md);
    assert.deepEqual(await readFile(image), data);
    assert.equal(downloads, 2);
    assert.equal(archives, 3);
    // Upgrade an existing scrape that saved the downscaled Markdown preview.
    const cached = JSON.parse(await readFile(manifest));
    const thumbnail = createHash("sha256").update(preview).digest("hex") + ".png";
    const low = md.replaceAll(hash + ".png", thumbnail).replaceAll(otherHash + ".gif", thumbnail);
    await writeFile(note, low);
    await writeFile(join(folder, thumbnail), preview);
    const old = cached.entries["./team (old).md"];
    old.hash = createHash("sha256").update(low).digest("hex");
    old.images = [thumbnail];
    delete old.originalImages;
    await writeFile(manifest, JSON.stringify(cached));
    docsImages = [originalName];
    await assert.rejects(scrapeDrive(runtime, dir), /Image count differs/);
    assert.equal(await readFile(note, "utf8"), low);
    docsImages = [originalName, secondName];
    await scrapeDrive(runtime, dir);
    assert.equal(JSON.parse(await readFile(manifest)).entries["./team (old).md"].originalImages, true);
    assert.equal(await readFile(note, "utf8"), md);
    await rm(folder, { recursive: true });
    await symlink(dir, folder);
    await assert.rejects(scrapeDrive(runtime, dir), /Expected an attachment directory/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("spreadsheet scrape downloads all tabs and directly linked files, without walking linked folders", async () => {
  const dir = await mkdtemp(join(import.meta.dirname, "gdrive-sheet-"));
  const base = "application/vnd.google-apps.";
  const hits = [], exports = [];
  let denied = true;
  const plain = "https://drive.google.com/open?id=doc";
  const runtime = {
    googleFormsTokens: { load: async () => ({ token: "saved" }) },
    http: { request: async (input, init) => {
      assert.equal(init.headers.authorization, "Bearer saved");
      const u = new URL(input);
      const id = u.pathname.split("/").at(-1);
      if (u.hostname === "sheets.googleapis.com") {
        assert.match(u.searchParams.get("fields"), /chipRuns/);
        return Response.json({ sheets: [
          { properties: { title: "First" }, data: [{ rowData: [{ values: [
            { formattedValue: plain, hyperlink: plain, userEnteredValue: { stringValue: plain } },
            { formattedValue: "See notes", textFormatRuns: [{ startIndex: 4, format: { link: { uri: "https://docs.google.com/document/d/second/edit" } } }] },
            { formattedValue: "Packet for Alex", userEnteredValue: { stringValue: "Packet for @" }, chipRuns: [{ startIndex: 11, chip: { richLinkProperties: { uri: "https://drive.google.com/drive/u/0/folders/group" } } }] },
          ] }] }] },
          { properties: { title: "Second" }, data: [{ startRow: 4, startColumn: 26, rowData: [{ values: [
            { userEnteredValue: { formulaValue: '=HYPERLINK("https://drive.google.com/file/d/third/view","Notes")' } },
            { hyperlink: plain },
            { hyperlink: "https://docs.google.com/spreadsheets/d/tracker/edit#gid=1" },
            { formattedValue: "https://somewhere.example/open?id=unrelated" },
          ] }] }] },
        ] });
      }
      assert.equal(u.hostname, "www.googleapis.com");
      assert.ok(!u.searchParams.has("q"), "linked folders must not be listed");
      if (id === "export") {
        const target = u.pathname.split("/").at(-2);
        exports.push([target, u.searchParams.get("mimeType")]);
        return new Response(target === "tracker" ? "workbook export bytes" : "document " + target);
      }
      hits.push(id);
      if (id === "third" && denied) return new Response("No access", { status: 403 });
      assert.ok(["tracker", "doc", "second", "third", "group"].includes(id));
      return Response.json({ id, name: id === "tracker" ? "Eng tracker" : id === "group" ? "Links" : "Review", mimeType: base + (id === "tracker" ? "spreadsheet" : id === "group" ? "folder" : "document"), version: "1" });
    } },
  };
  const target = join(dir, "Eng tracker");
  try {
    await assert.rejects(scrapeDrive(runtime, dir, "https://docs.google.com/spreadsheets/d/tracker/edit"), /3 downloaded.*\n.*linked folder.*\nSecond!AA5 \(third\).*403/s);
    assert.equal(await readFile(join(target, "Eng tracker.xlsx"), "utf8"), "workbook export bytes");
    assert.equal(await readFile(join(target, "Review (2).md"), "utf8"), "document second");
    const tableFile = join(target, "Eng tracker.md"), table = await readFile(tableFile, "utf8");
    assert.ok(table.includes("See [notes](https://docs.google.com/document/d/second/edit) | Packet for [Alex](https://drive.google.com/drive/u/0/folders/group)"));
    const second = table.split("## Second\n\n")[1].trimEnd().split("\n");
    assert.equal(second.length, 6);
    assert.equal(second[0].split("|").length - 2, 30);
    assert.equal(second[5].split("|")[30].trim(), "https://somewhere.example/open?id=unrelated");
    assert.deepEqual(hits, ["tracker", "doc", "second", "group", "third"]);
    const state = JSON.parse(await readFile(join(target, ".wire-gdrive.json")));
    assert.deepEqual(state.links.doc, ["First!A1", "Second!AB5"]);
    // A scrape created by an older Wire already owns its ID-suffixed path.
    await rename(join(target, "Review (2).md"), join(target, "Review (second).md"));
    const previous = state.entries["./review (2).md"];
    delete previous.path;
    state.entries["./review (second).md"] = previous;
    delete state.entries["./review (2).md"];
    await writeFile(join(target, ".wire-gdrive.json"), JSON.stringify(state));
    denied = false;
    assert.match(await scrapeDrive(runtime, target), /1 downloaded, 3 unchanged/);
    assert.equal(await readFile(join(target, "Review (second).md"), "utf8"), "document second");
    assert.equal(await readFile(join(target, "Review (2).md"), "utf8"), "document third");
    assert.deepEqual(exports.map(v => v[0]), ["tracker", "doc", "second", "third"]);
    await writeFile(join(target, "Review.md"), "local edit");
    await assert.rejects(scrapeDrive(runtime, target), /Local file changed/);
    assert.equal(await readFile(join(target, "Review.md"), "utf8"), "local edit");
    await writeFile(tableFile, "edited table");
    await assert.rejects(scrapeDrive(runtime, target), /Local file changed: Eng tracker.md/);
    assert.equal(await readFile(tableFile, "utf8"), "edited table");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("spreadsheet PDFs use the linked title, preserve the original, and keep edits after titles change", async () => {
  const dir = await mkdtemp(join(import.meta.dirname, "gdrive-sheet-pdf-"));
  const pdf = PdfDocument.create();
  pdf.addPage().drawText("A concrete example", { x: 30, y: 600, size: 12 });
  const bytes = pdf.save();
  let label = "Feedback packet", downloads = 0;
  const runtime = {
    googleFormsTokens: { load: async () => ({ token: "saved" }) },
    http: { request: async input => {
      const u = new URL(input);
      if (u.hostname === "sheets.googleapis.com") return Response.json({ sheets: [
        { properties: { title: "Team" }, data: [{ rowData: [{ values: [
          { hyperlink: "https://docs.google.com/document/d/note/edit" },
          { formattedValue: label, hyperlink: "https://drive.google.com/file/d/packet/view" },
        ] }] }] },
      ] });
      if (u.searchParams.has("alt")) { downloads++; return new Response(bytes); }
      if (u.pathname.endsWith("/note")) return Response.json({ id: "note", name: "Feedback packet", mimeType: "application/vnd.google-apps.document", version: "1" });
      if (u.pathname.endsWith("/export")) return new Response("workbook");
      return Response.json(u.pathname.endsWith("/tracker")
        ? { id: "tracker", name: basename(dir), mimeType: "application/vnd.google-apps.spreadsheet", version: "1" }
        : { id: "packet", name: "1b8ca16bfc68be755861cc1b9f720e8b.pdf", mimeType: "application/pdf", version: "1" });
    } },
  };
  const original = join(dir, "Feedback packet (2).pdf"), md = join(dir, "Feedback packet (2).md");
  try {
    await scrapeDrive(runtime, dir, "https://docs.google.com/spreadsheets/d/tracker/edit");
    assert.equal(await readFile(join(dir, "Feedback packet.md"), "utf8"), "workbook");
    assert.deepEqual(await readFile(original), Buffer.from(bytes));
    assert.match(await readFile(md, "utf8"), /A concrete example/);
    label = "Renamed sheet link";
    assert.match(await scrapeDrive(runtime, dir), /3 unchanged/);
    assert.equal(downloads, 1);
    await writeFile(md, "my edit");
    await assert.rejects(scrapeDrive(runtime, dir, undefined, true), /Local file changed/);
    assert.equal(await readFile(md, "utf8"), "my edit");
    assert.deepEqual(await readFile(original), Buffer.from(bytes));
    await writeFile(md, pdfMarkdown(bytes));
    if (spawnSync("pdftotext", ["-v"]).status === 0) {
      assert.match(await scrapeDrive(runtime, dir, undefined, true), /removed 1 local PDF/);
      await assert.rejects(readFile(original), { code: "ENOENT" });
      assert.match(await scrapeDrive(runtime, dir), /3 unchanged/);
      assert.equal(downloads, 1);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("spreadsheet tables preserve displayed values, embedded breaks, blank columns, and multiple rich-text links", async () => {
  const { sheetMarkdown } = await import("../dist/adapters/sheet-markdown.js");
  const md = sheetMarkdown([{ properties: { title: "Summary" }, data: [{ rowData: [
    { values: [{ formattedValue: "Cost | units" }, {}, { formattedValue: "Notes" }] },
    { values: [{ formattedValue: "$1,000.00" }, {}, { formattedValue: "A+B\n<C>", textFormatRuns: [
      { startIndex: 0, format: { link: { uri: "https://a.test/a(b)" } } },
      { startIndex: 1 }, { startIndex: 2, format: { link: { uri: "https://b.test" } } }, { startIndex: 3 },
    ] }] },
  ] }] }, { properties: { title: "Empty" } }]);
  assert.equal(md, "## Summary\n\n| Cost &#124; units |  | Notes |\n| --- | --- | --- |\n| $1,000.00 |  | [A](https://a.test/a%28b%29)+[B](https://b.test)<br>&lt;C&gt; |\n\n## Empty\n\n|  |\n| --- |\n");
});

test("legacy smart chips can span displayed titles, with distinct URLs per chip", async () => {
  const { sheetMarkdown } = await import("../dist/adapters/sheet-markdown.js");
  const text = "Current\nPrior";
  const cell = { formattedValue: text, userEnteredValue: { stringValue: text }, chipRuns: [
    { chip: { richLinkProperties: { uri: "https://example.com/current" } } }, { startIndex: 7 },
    { startIndex: 8, chip: { richLinkProperties: { uri: "https://example.com/prior" } } },
  ] };
  assert.match(sheetMarkdown([{ properties: { title: "Notes" }, data: [{ rowData: [{ values: [cell] }] }] }]), /\[Current\]\(https:\/\/example.com\/current\)<br>\[Prior\]\(https:\/\/example.com\/prior\)/);
});
