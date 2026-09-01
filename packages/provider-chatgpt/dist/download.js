import { createHash } from "node:crypto";
import { connectChatgpt, object, text } from "./client.js";
import { ChatgptCooldownError } from "./cooldown.js";
function segment(value) {
    const safe = value.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 64);
    return safe === value && safe !== "." && safe !== ".." && safe !== "" ? safe : `${safe || "item"}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}
function items(value) {
    if (!Array.isArray(value))
        throw new Error("ChatGPT list response is missing items");
    return value.map((item) => object(item));
}
function identifier(value) {
    const id = text(value["id"]) ?? text(value["conversation_id"]);
    if (id === undefined)
        throw new Error("ChatGPT item is missing its identifier");
    return id;
}
function endpoint(path, query) {
    return `${path}?${new URLSearchParams(query)}`;
}
function assets(value, context) {
    const found = new Map();
    const addFile = (id, name) => {
        const queryIndex = id.indexOf("?");
        const fileId = (queryIndex === -1 ? id : id.slice(0, queryIndex)).replaceAll("#", "*");
        const query = Object.fromEntries(new URLSearchParams(queryIndex === -1 ? "" : id.slice(queryIndex + 1)));
        if (context.conversation !== undefined)
            query["conversation_id"] = context.conversation;
        if (context.project !== undefined)
            query["gizmo_id"] = context.project;
        const key = `file:${id}`;
        found.set(key, { key, name: name ?? fileId, endpoint: endpoint(`/backend-api/files/download/${encodeURIComponent(fileId)}`, query) });
    };
    const visit = (node, message) => {
        if (typeof node === "string") {
            if (node.startsWith("file-service://") || node.startsWith("sediment://"))
                addFile(node.slice(node.indexOf("://") + 3));
            if (context.conversation !== undefined && message !== undefined) {
                for (const match of node.matchAll(/sandbox:(\/[^\s)\]<>"']+)/g)) {
                    const path = match[1];
                    const key = `sandbox:${message}:${path}`;
                    found.set(key, { key, name: path.split("/").pop() || "file", endpoint: endpoint(`/backend-api/conversation/${encodeURIComponent(context.conversation)}/interpreter/download`, { message_id: message, sandbox_path: path }) });
                }
            }
        }
        else if (Array.isArray(node)) {
            for (const child of node)
                visit(child, message);
        }
        else if (node !== null && typeof node === "object") {
            const record = node;
            const currentMessage = record["author"] !== undefined ? text(record["id"]) ?? message : message;
            const fileId = text(record["file_id"]) ?? (/^file[-_]/.test(text(record["id"]) ?? "") ? text(record["id"]) : undefined);
            if (fileId !== undefined)
                addFile(fileId, text(record["name"]) ?? text(record["filename"]));
            const libraryId = text(record["library_file_id"]) ?? (text(record["id"])?.startsWith("libfile_") ? text(record["id"]) : undefined);
            if (fileId === undefined && libraryId !== undefined) {
                const key = `library:${libraryId}`;
                found.set(key, { key, name: text(record["name"]) ?? libraryId, endpoint: `/backend-api/files/library/files/${encodeURIComponent(libraryId)}/content_url` });
            }
            for (const child of Object.values(record))
                visit(child, currentMessage);
        }
    };
    visit(value, context.message);
    return [...found.values()];
}
class DownloadWriteError extends Error {
}
export async function downloadChatgpt(runtime, url, source, write, render) {
    if (source.type !== "project")
        return null;
    const wholeHistory = source.identifier === "history";
    const base = wholeHistory ? "chatgpt" : `chatgpt/projects/${segment(source.identifier)}`;
    const title = wholeHistory ? "ChatGPT history" : "ChatGPT project";
    const errors = [];
    const skipped = [];
    const records = [];
    const files = [];
    const cooldowns = [];
    const started = runtime.clock.now().toISOString();
    const save = async (path, contents) => {
        try {
            await write(path, contents);
        }
        catch (error) {
            throw new DownloadWriteError(`Could not write ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const json = (path, value) => save(path, `${JSON.stringify(value, null, 2)}\n`);
    const attempt = async (resource, action) => {
        try {
            return await action();
        }
        catch (error) {
            if (error instanceof DownloadWriteError || error instanceof ChatgptCooldownError)
                throw error;
            errors.push({ resource, error: error instanceof Error ? error.message : String(error) });
            return undefined;
        }
    };
    const session = await connectChatgpt(runtime, url, async (cooldown) => {
        cooldowns.push(cooldown);
        await json(`${base}/manifest.json`, { status: "cooldown", source: url, started_at: started, records, files, errors, skipped, cooldowns, retry_at: cooldown.retry_at });
    });
    await json(`${base}/manifest.json`, { status: "in_progress", source: url, started_at: started });
    const paged = async (client, path, query, output, consume, offsetMode = false, filter) => {
        const seen = new Set();
        let cursor;
        let offset = 0;
        let pageNumber = 0;
        for (;;) {
            const parameters = { ...query, ...(offsetMode ? { offset: String(offset) } : cursor === undefined ? {} : { cursor }) };
            const page = object(await client.json(endpoint(path, parameters)));
            const entries = items(page["items"]);
            await json(`${output}/${pageNumber++}.json`, filter === undefined ? page : { ...page, items: entries.filter(filter) });
            for (const item of entries)
                consume(item);
            if (offsetMode) {
                if (page["offset"] !== undefined && page["offset"] !== offset)
                    throw new Error(`ChatGPT returned a different offset for ${path}`);
                if (entries.length === 0) {
                    if (typeof page["total"] === "number" && offset < page["total"])
                        throw new Error(`ChatGPT listing stopped before its reported total: ${path}`);
                    break;
                }
                const signature = entries.map(identifier).join("|");
                if (seen.has(signature))
                    throw new Error(`ChatGPT repeated a page: ${path}`);
                seen.add(signature);
                offset += entries.length;
                if (typeof page["total"] === "number" && offset >= page["total"])
                    break;
            }
            else {
                if (!("cursor" in page) && !("next_cursor" in page) && page["has_more"] !== false)
                    throw new Error(`ChatGPT list response is missing pagination metadata: ${path}`);
                const next = page["cursor"] ?? page["next_cursor"];
                if (next == null || next === "") {
                    if (page["has_more"] === true)
                        throw new Error(`ChatGPT listing has more items but no cursor: ${path}`);
                    break;
                }
                if (typeof next !== "string" && typeof next !== "number")
                    throw new Error(`Invalid ChatGPT pagination cursor: ${path}`);
                cursor = String(next);
                if (seen.has(cursor))
                    throw new Error(`ChatGPT repeated a cursor: ${path}`);
                seen.add(cursor);
            }
        }
    };
    const downloadAssets = async (client, references, directory) => {
        const links = [];
        for (const asset of references) {
            await attempt(asset.endpoint, async () => {
                const metadata = object(await client.json(asset.endpoint));
                const downloadUrl = text(metadata["download_url"]) ?? text(metadata["content_url"]);
                if (downloadUrl === undefined)
                    throw new Error(`ChatGPT file is unavailable (${String(metadata["status"] ?? "missing URL")})`);
                const bytes = await client.bytes(downloadUrl);
                const name = `${createHash("sha256").update(asset.key).digest("hex").slice(0, 12)}-${segment(asset.name)}`;
                const path = `${directory}/assets/${name}`;
                await save(path, bytes);
                files.push({ path, source: asset.endpoint, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
                links.push(`- [${asset.name.replace(/[\[\]\r\n]/g, " ")}](assets/${encodeURIComponent(name)})`);
            });
        }
        return links;
    };
    const exportAccount = async (client, directory, projectId) => {
        const conversations = new Map();
        const projects = new Map();
        const projectConversations = new Map();
        const addConversation = (entry, owner) => {
            const id = identifier(entry);
            conversations.set(id, { ...conversations.get(id), ...entry });
            const project = owner ?? text(entry["gizmo_id"]) ?? text(entry["conversation_template_id"]);
            if (project?.startsWith("g-p-")) {
                if (!projects.has(project))
                    projects.set(project, undefined);
                if (!projectConversations.has(project))
                    projectConversations.set(project, new Set());
                projectConversations.get(project).add(id);
            }
        };
        for (const archived of [false, true])
            for (const starred of [false, true]) {
                await attempt(`${client.id}: ${archived ? "archived" : "active"} ${starred ? "starred" : "unstarred"} conversations`, () => paged(client, "/backend-api/conversations", { limit: "100", order: "updated", is_archived: String(archived), is_starred: String(starred) }, `${directory}/listings/${archived ? "archived" : "active"}-${starred ? "starred" : "unstarred"}`, (entry) => {
                    if (projectId === undefined || entry["gizmo_id"] === projectId || entry["conversation_template_id"] === projectId)
                        addConversation(entry);
                }, true, projectId === undefined ? undefined : (entry) => entry["gizmo_id"] === projectId || entry["conversation_template_id"] === projectId));
            }
        if (projectId === undefined) {
            await attempt(`${client.id}: projects`, () => paged(client, "/backend-api/gizmos/snorlax/sidebar", { owned_only: "false", conversations_per_gizmo: "5", limit: "20" }, `${directory}/listings/projects`, (entry) => {
                const wrapper = object(entry["gizmo"]);
                const project = object(wrapper["gizmo"]);
                const id = identifier(project);
                projects.set(id, wrapper);
                if (entry["conversations"] !== undefined)
                    for (const conversation of items(object(entry["conversations"])["items"]))
                        addConversation(conversation, id);
            }));
        }
        else
            projects.set(projectId, undefined);
        for (const [id, fallback] of projects) {
            const projectDirectory = projectId === undefined ? `${directory}/projects/${segment(id)}` : directory;
            const metadata = await attempt(`${client.id}: project ${id}`, () => client.json(`/backend-api/gizmos/${encodeURIComponent(id)}`));
            const detail = metadata ?? fallback;
            let projectTitle = id;
            let instructions = "";
            let fileLinks = [];
            if (detail !== undefined) {
                await json(`${projectDirectory}/project.json`, detail);
                await attempt(`${id}: project metadata`, async () => {
                    const wrapper = object(detail);
                    const project = object(wrapper["gizmo"]);
                    projectTitle = text(object(project["display"])["name"]) ?? id;
                    instructions = text(project["instructions"]) ?? "";
                    fileLinks = await downloadAssets(client, assets(wrapper, { project: id }), projectDirectory);
                });
            }
            await attempt(`${id}: project conversations`, () => paged(client, `/backend-api/gizmos/${encodeURIComponent(id)}/conversations`, { limit: "50", owned_only: "false" }, `${projectDirectory}/listings/conversations`, (entry) => addConversation(entry, id)));
            await attempt(`${id}: project sources`, () => paged(client, `/backend-api/projects/${encodeURIComponent(id)}/connector_scopes`, { limit: "100" }, `${projectDirectory}/sources`, () => { }));
            const ids = [...(projectConversations.get(id) ?? [])];
            const prefix = projectId === undefined ? "../../" : "";
            const markdown = `# ${projectTitle}\n\n## Instructions\n\n${instructions || "No project instructions."}\n\n## Conversations\n\n${ids.map((conversationId) => `- [${conversationId}](${prefix}conversations/${segment(conversationId)}/index.md)`).join("\n") || "No conversations."}\n\n## Files\n\n${fileLinks.join("\n") || "See project.json and sources for source metadata."}\n`;
            await save(`${projectDirectory}/index.md`, markdown);
            records.push({ type: "project", account_id: client.id, id, title: projectTitle, path: `${projectDirectory}/index.md`, conversations: ids });
        }
        for (const [id, listing] of conversations) {
            const conversationDirectory = `${directory}/conversations/${segment(id)}`;
            await json(`${conversationDirectory}/listing.json`, listing);
            await attempt(`${client.id}: conversation ${id}`, async () => {
                const conversation = object(await client.json(`/backend-api/conversation/${encodeURIComponent(id)}`));
                await json(`${conversationDirectory}/conversation.json`, conversation);
                records.push({ type: "conversation", account_id: client.id, id, title: text(conversation["title"]) ?? id, path: `${conversationDirectory}/index.md`, raw: `${conversationDirectory}/conversation.json` });
                const fileLinks = await downloadAssets(client, assets(conversation, { conversation: id }), conversationDirectory);
                await attempt(`${id}: canvases`, async () => {
                    const canvases = await client.json(`/backend-api/conversation/${encodeURIComponent(id)}/textdocs`);
                    await json(`${conversationDirectory}/textdocs.json`, canvases);
                    for (const canvas of items(canvases)) {
                        const content = text(canvas["content"]);
                        if (content !== undefined)
                            await save(`${conversationDirectory}/canvases/${segment(identifier(canvas))}.txt`, content);
                    }
                });
                const markdown = await attempt(`${id}: readable transcript`, async () => render(conversation));
                await save(`${conversationDirectory}/index.md`, `${markdown ?? `# ${text(conversation["title"]) ?? id}\n\nThe readable transcript could not be rendered; the full JSON is preserved.\n`}\n## Archive\n\n[Complete conversation JSON (all branches and metadata)](conversation.json)\n\n${fileLinks.join("\n")}\n`);
            });
        }
        if (projectId === undefined) {
            const directories = [undefined];
            const seenDirectories = new Set();
            const library = new Map();
            for (const parent of directories) {
                await attempt(`${client.id}: library ${parent ?? "root"}`, () => paged(client, "/backend-api/files/library/nodes", { include_hidden_files: "true", include_saved_entities: "true", ...(parent === undefined ? {} : { parent_directory_id: parent }) }, `${directory}/library/listings/${parent === undefined ? "root" : segment(parent)}`, (entry) => {
                    const id = text(entry["id"]) ?? text(entry["library_file_id"]);
                    if (id === undefined)
                        throw new Error("ChatGPT Library item is missing its identifier");
                    if (entry["type"] === "folder" || entry["kind"] === "folder" || entry["kind"] === "directory" || entry["node_type"] === "directory") {
                        if (!seenDirectories.has(id)) {
                            seenDirectories.add(id);
                            directories.push(id);
                        }
                    }
                    else
                        library.set(id, entry);
                }));
            }
            for (const [id, entry] of library) {
                const fileDirectory = `${directory}/library/files/${segment(id)}`;
                await json(`${fileDirectory}/metadata.json`, entry);
                const links = await downloadAssets(client, [{ key: `library:${id}`, name: text(entry["name"]) ?? id, endpoint: `/backend-api/files/library/files/${encodeURIComponent(id)}/content_url` }], fileDirectory);
                await save(`${fileDirectory}/index.md`, `# ${text(entry["name"]) ?? id}\n\n${links.join("\n")}\n`);
            }
            for (const path of ["me", "user_system_messages", "settings/user"]) {
                await attempt(`${client.id}: ${path}`, async () => json(`${directory}/account/${path.replaceAll("/", "-")}.json`, await client.json(`/backend-api/${path}`)));
            }
        }
    };
    const exportAll = async () => {
        if (!wholeHistory) {
            await exportAccount(session.forAccount(session.accountId), base, source.identifier);
            return;
        }
        const current = session.forAccount(session.accountId);
        const accounts = await attempt("accounts", () => current.json("/backend-api/accounts/check/v4-2023-04-27"));
        const accountIds = new Set([session.accountId]);
        if (accounts !== undefined) {
            await json(`${base}/accounts.json`, accounts);
            await attempt("account listing", async () => {
                for (const value of Object.values(object(object(accounts)["accounts"]))) {
                    const entry = object(value);
                    const account = object(entry["account"]);
                    const id = text(account["account_id"]);
                    if (id === undefined || accountIds.has(id))
                        continue;
                    if (entry["can_access_with_session"] === false || account["is_deactivated"] === true)
                        skipped.push({ type: "account", id, reason: "Not accessible with the current session or deactivated" });
                    else
                        accountIds.add(id);
                }
            });
        }
        for (const id of accountIds)
            await exportAccount(session.forAccount(id), `${base}/accounts/${segment(id)}`);
    };
    try {
        await exportAll();
    }
    catch (error) {
        if (!(error instanceof ChatgptCooldownError))
            throw error;
        errors.push({ resource: error.cooldown.endpoint, error: error.message, retry_at: error.cooldown.retry_at });
    }
    const status = errors.length === 0 ? "complete" : "partial";
    const manifest = { status, source: url, started_at: started, finished_at: runtime.clock.now().toISOString(), records, files, errors, skipped, cooldowns };
    await json(`${base}/manifest.json`, manifest);
    const relative = (path) => path.slice(base.length + 1);
    const lines = records.map((record) => `- ${record["type"]}: [${String(record["title"]).replace(/[\[\]\r\n]/g, " ")}](${relative(record["path"])})`);
    const markdown = `# ${title}\n\nStatus: **${status}**\n\n${records.filter((record) => record["type"] === "conversation").length} conversations, ${records.filter((record) => record["type"] === "project").length} projects, ${files.length} downloaded files.\n\n[Export manifest](manifest.json) records every failure and unavailable account. Raw conversation JSON preserves all returned branches, messages, citations, and metadata; Markdown is the readable active branch. Deleted or expired server data cannot be recovered. Linked external sources are recorded, not recursively fetched.\n\n${lines.join("\n")}\n${errors.length === 0 ? "" : `\n## Incomplete downloads\n\n${errors.map((error) => `- ${error["resource"]}: ${error["error"]}`).join("\n")}\n`}`;
    const path = `${base}/${wholeHistory ? "index" : "export"}.md`;
    const retryAt = errors.map((error) => text(error["retry_at"])).filter((value) => value !== undefined).sort().at(-1);
    return { title, markdown, path, data: { status, manifest: `${base}/manifest.json`, conversations: records.filter((record) => record["type"] === "conversation").length, projects: records.filter((record) => record["type"] === "project").length, files: files.length, errors: errors.length }, ...(errors.length === 0 ? {} : { error: `${errors.length} downloads failed. See ${base}/manifest.json; successfully downloaded data was retained.${retryAt === undefined ? "" : ` Retry no earlier than ${retryAt}.`}` }) };
}
//# sourceMappingURL=download.js.map