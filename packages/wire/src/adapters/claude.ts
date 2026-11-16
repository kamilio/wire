import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessCapability } from "wire-core";

type Summary = { uuid: string; name: string; created_at: string; updated_at: string };
type Message = { sender: string; text: string; content: { type: string; text?: string }[]; attachments: { file_name: string }[]; files: { file_name: string }[] };
type Chat = Summary & { chat_messages: Message[] };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function noteName(chat: Summary) {
  if (!uuid.test(chat.uuid)) throw new Error("Invalid Claude conversation ID.");
  const title = (chat.name || "Untitled").replace(/[\p{C}<>:"/\\|?*#[\]^]/gu, " ").replace(/\s+/g, " ").trim();
  return chat.created_at.slice(0, 10).replace(/[^0-9-]/g, "") + " " + Array.from(title).slice(0, 44).join("") + " " + chat.uuid + ".md";
}

export function claudeMarkdown(chat: Chat) {
  const lines = ["# " + (chat.name || "Untitled"), "", `[Open in Claude](https://claude.ai/chat/${chat.uuid}) · [Original JSON](.originals/${chat.uuid}.json)`, "", "Created: " + chat.created_at, "Updated: " + chat.updated_at];
  for (const message of chat.chat_messages) {
    const text = message.content.filter(block => block.type === "text").map(block => block.text).join("\n\n");
    lines.push("", "## " + (message.sender === "human" ? "You" : message.sender === "assistant" ? "Claude" : message.sender), "", text || message.text || "_See original JSON for message content._");
    const files = [...new Set([...message.attachments, ...message.files].map(f => f.file_name).filter(Boolean))];
    if (files.length) lines.push("", "Attachments: " + files.join(", "));
  }
  return lines.join("\n").trimEnd() + "\n";
}

export async function scrapeClaude(process: ProcessCapability, directory: string) {
  const root = join(directory, "claude"), originals = join(root, ".originals");
  await mkdir(originals, { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(join(originals, ".download-"));
  const args = ["-s=wire-claude-" + randomUUID(), "--raw"];
  const run = (...cmd: string[]) => process.execute("playwright-cli", [...args, ...cmd]);
  let saved = 0, unchanged = 0, edited = 0;
  // Use a file for responses: a single conversation can exceed the subprocess stdout limit.
  async function get<T>(paths: string[]): Promise<T[]> {
    const path = join(scratch, "response.json");
    await rm(path, { force: true });
    const result = await run("eval", `async () => {
      if(location.origin !== "https://claude.ai") throw Error("Sign in to claude.ai in Chrome.");
      return Promise.all(${JSON.stringify(paths)}.map(async path => {
        const r = await fetch(path);
        if (!r.ok) throw Error("Claude HTTP " + r.status());
        return r.json();
      }));
    }`, "--filename=" + path);
    if (!existsSync(path)) throw new Error("Claude download failed: " + result.stdout.slice(0, 220));
    return JSON.parse(await readFile(path, "utf8"));
  }
  try {
    await process.execute("hey-browser", ["run", "--", "playwright-cli", ...args, "attach", "--extension=chrome"]);
    try {
      await run("tab-new", "https://claude.ai/");
      try {
        const [orgs] = await get<{ uuid: string; capabilities: string[] }[]>(["/api/organizations"]);
        const chats = orgs!.filter(org => org.capabilities.includes("chat"));
        if (!chats.length) throw new Error("No Claude chat workspace found. Sign in to claude.ai in Chrome.");
        for (const org of chats) {
          if (!uuid.test(org.uuid)) throw new Error("Invalid Claude workspace ID.");
          const base = "/api/organizations/" + org.uuid;
          const seen = new Set<string>();
          for (const archived of [false, true]) {
            for (let offset = 0; ;) {
              const [page] = await get<{ data: Summary[]; has_more: boolean }>([base + "/chat_conversations_v2?limit=100&archived=" + archived + "&offset=" + offset]);
              const pending: Summary[] = [];
              const before = seen.size;
              for (const summary of page!.data) {
                if (!uuid.test(summary.uuid)) throw new Error("Invalid Claude conversation ID.");
                if (seen.has(summary.uuid)) continue;
                seen.add(summary.uuid);
                const raw = join(originals, summary.uuid + ".json");
                if (existsSync(raw)) {
                  const old: Chat = JSON.parse(await readFile(raw, "utf8"));
                  if (old.updated_at === summary.updated_at && existsSync(join(root, noteName(old)))) { unchanged++; continue; }
                }
                pending.push(summary);
              }
              for (let i = 0; i < pending.length; i += 4) {
                const batch = pending.slice(i, i + 4);
                const details = await get<Chat>(batch.map(s => base + "/chat_conversations/" + s.uuid + "?tree=True&rendering_mode=messages&render_all_tools=true"));
                for (const [j, chat] of details.entries()) {
                  if (chat.uuid !== batch[j]!.uuid) throw new Error("Claude conversation ID mismatch.");
                  const raw = join(originals, chat.uuid + ".json"), path = join(root, noteName(chat));
                  const old: Chat | undefined = existsSync(raw) ? JSON.parse(await readFile(raw, "utf8")) : undefined;
                  const oldPath = old && join(root, noteName(old));
                  const markdown = claudeMarkdown(chat);
                  if (existsSync(path) && path !== oldPath && await readFile(path, "utf8") !== markdown) { edited++; continue; }
                  if (old && oldPath && existsSync(oldPath)) {
                    const local = await readFile(oldPath, "utf8");
                    if (local !== claudeMarkdown(old) && !(oldPath === path && local === markdown)) { edited++; continue; }
                  }
                  await writeFile(join(scratch, "note"), markdown, { mode: 0o600 });
                  await writeFile(join(scratch, "original"), JSON.stringify(chat, null, 2), { mode: 0o600 });
                  await rename(join(scratch, "note"), path);
                  await rename(join(scratch, "original"), raw);
                  if (oldPath && oldPath !== path) await rm(oldPath, { force: true });
                  saved++;
                }
              }
              if (!page!.has_more) break;
              if (before === seen.size) throw new Error("Claude history pagination stopped advancing.");
              offset += page!.data.length;
            }
          }
        }
      } finally { await run("tab-close"); }
    } finally { await run("detach"); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
  return `Claude: ${saved} saved, ${unchanged} unchanged, ${edited} locally edited and skipped.\n${root}`;
}
