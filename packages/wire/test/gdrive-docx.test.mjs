import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { convert } from "@poe-platform/safe-bash/commands/pandoc";
import { scrapeDrive, previewDrive } from "../dist/adapters/gdrive.js";

test("DOCX conversion preserves titles and rich text, and cleanup requires independent verification", async (t) => {
  const dir = await mkdtemp(join(import.meta.dirname, "docx-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const make = async text => (await convert([{bytes: Buffer.from(text)}], {from: "markdown", to: "docx"}, {})).bytes;
  let bytes = await make("# Synthetic review\n\n**One** [example](https://example.org)."), version = "1", reads = 0;
  const file = () => ({ id: "a", name: "Review", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", version });
  const runtime = { googleFormsTokens: { load: async () => ({token: "test"}) }, http: { request: async (input) => {
    const url = new URL(input);
    if (url.searchParams.has("alt")) { reads++; return new Response(bytes); }
    if (url.pathname.endsWith("/a")) return Response.json(file());
    return Response.json(url.pathname.endsWith("/root") ? {name: basename(dir), mimeType: "application/vnd.google-apps.folder"} : {files: [file()]});
  } } };
  const doc = join(dir, "Review.docx"), md = join(dir, "Review.md");
  await scrapeDrive(runtime, dir, "https://drive.google.com/drive/folders/root", true);
  assert.match(await readFile(md, "utf8"), /\*\*One\*\* \[example\]\(<https:\/\/example.org>\)/);
  assert.equal(await previewDrive(runtime, "https://drive.google.com/file/d/a/view"), await readFile(md, "utf8"));
  assert.deepEqual(await readFile(doc), Buffer.from(bytes));
  if (spawnSync("pandoc", ["--version"]).status !== 0 || spawnSync("unzip", ["-v"]).status !== 0) return;
  await scrapeDrive(runtime, dir, undefined, false, true);
  await assert.rejects(readFile(doc), {code: "ENOENT"});
  await scrapeDrive(runtime, dir);
  assert.equal(reads, 2);
  await writeFile(md, "Local edits");
  await assert.rejects(scrapeDrive(runtime, dir), /Local file changed/);
  await rm(md);
  // A reader may return all body text while omitting the review comments part.
  version = "2";
  const fixture = join(dir, "fixture.docx");
  await writeFile(fixture, bytes);
  await mkdir(join(dir, "word"));
  await writeFile(join(dir, "word/comments.xml"), '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1"><w:p><w:r><w:t>Remember this feedback.</w:t></w:r></w:p></w:comment></w:comments>');
  const types = "[Content_Types].xml";
  const typesContent = spawnSync("unzip", ["-p", fixture, "\\[Content_Types\\].xml"], {encoding: "utf8"}).stdout;
  await writeFile(join(dir, types), typesContent.replace("</Types>", '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'));
  assert.equal(spawnSync("zip", ["-q", fixture, "word/comments.xml", types], {cwd: dir}).status, 0);
  bytes = await readFile(fixture);
  const summary = await scrapeDrive(runtime, dir, undefined, false, true);
  assert.match(summary, /DOCX originals kept/);
  assert.deepEqual(await readFile(doc), Buffer.from(bytes));
});
