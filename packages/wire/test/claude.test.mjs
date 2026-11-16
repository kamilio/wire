import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { scrapeClaude } from "../dist/adapters/claude.js";

test("archives all chat workspaces and pages, refreshes without overwriting local edits", async t => {
  const parent = resolve(import.meta.dirname, "../../../out");
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, "claude-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const orgs = [randomUUID(), randomUUID()];
  const chats = Array.from({length: 4}, () => ({
    uuid: randomUUID(), name: "Same / title", created_at: "2026-01-01", updated_at: "v1",
    chat_messages: [{sender: "human", content: [{type: "text", text: "My **question**"}], attachments: [], files: []}],
  }));
  let downloads = 0;
  const process = { execute: async (_, args) => {
    if (!args.includes("eval")) return {stdout: ""};
    const fetch = async path => {
      const url = new URL(path, "https://claude.ai");
      const org = path.split("/")[3];
      let data;
      if (path === "/api/organizations") data = [...orgs.map(uuid => ({uuid, capabilities: ["chat"]})), {uuid: randomUUID(), capabilities: ["api"]}];
      else if (url.pathname.endsWith("_v2")) {
        assert.ok(orgs.includes(org));
        const archived = url.searchParams.get("archived") === "true";
        const first = org === orgs[0], offset = Number(url.searchParams.get("offset"));
        data = {data: archived ? first ? [chats[2]] : [] : [chats[first ? offset : 3]], has_more: first && !archived && !offset};
      } else {
        downloads++;
        data = chats.find(chat => path.includes(chat.uuid));
        assert.ok(data);
      }
      return {ok: true, json: () => data};
    };
    const output = await runInNewContext("(" + args.at(-2) + ")()", {fetch, location: {origin: "https://claude.ai"}});
    await writeFile(args.at(-1).slice("--filename=".length), JSON.stringify(output));
    return {stdout: ""};
  }};
  assert.match(await scrapeClaude(process, dir), /4 saved/);
  const root = join(dir, "claude");
  const notes = (await readdir(root)).filter(name => name.endsWith(".md"));
  assert.equal(notes.length, 4);
  const local = join(root, notes.find(name => name.includes(chats[0].uuid)));
  assert.match(await readFile(local, "utf8"), /## You\n\nMy \*\*question\*\*/);
  assert.deepEqual(JSON.parse(await readFile(join(root, ".originals", chats[0].uuid + ".json"))), chats[0]);
  assert.match(await scrapeClaude(process, dir), /4 unchanged/);
  assert.equal(downloads, 4);
  await writeFile(local, "My annotations");
  chats[0].updated_at = chats[1].updated_at = "v2";
  chats[1].name = "Renamed";
  assert.match(await scrapeClaude(process, dir), /1 saved, 2 unchanged, 1 locally edited/);
  assert.equal(await readFile(local, "utf8"), "My annotations");
  assert.equal((await readdir(root)).filter(name => name.endsWith(".md")).length, 4);
});
