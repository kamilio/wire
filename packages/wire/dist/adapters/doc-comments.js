import { decodeHTML } from "entities";
import { drive } from "./gdrive.js";
function documentId(url) {
    const id = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)(?:[/?#]|$)/.exec(url)?.[1];
    if (!id)
        throw new Error("Expected a Google Docs document URL.");
    return id;
}
export async function listDocComments(runtime, url) {
    const id = documentId(url), threads = [];
    let pageToken = "";
    do {
        const page = await (await drive(runtime, "/" + id + "/comments", {
            fields: "nextPageToken,comments(id,resolved,content,author(displayName),quotedFileContent,replies(content,action,author(displayName)))",
            pageSize: "100", ...(pageToken && { pageToken }),
        })).json();
        for (const c of page.comments)
            threads.push({ ...c, url: threadUrl(id, c.id) });
        pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    return threads;
}
function threadUrl(id, thread) {
    if (!/^[\w.-]+$/.test(thread) || thread === "." || thread === "..")
        throw new Error("Expected a Google Docs comment link with ?disco=<comment-id>.");
    return "https://docs.google.com/document/d/" + id + "/edit?disco=" + thread;
}
export function formatDocComments(threads) {
    return ["## Comments", ...threads.map(c => [
            (c.resolved ? "Resolved" : "Open") + " · " + c.url,
            ...(c.quotedFileContent?.value ? [(c.quotedFileContent.mimeType === "text/html" ? decodeHTML(c.quotedFileContent.value) : c.quotedFileContent.value).replace(/^/gm, "> ")] : []),
            ...[c, ...c.replies].map(r => r.author.displayName + ": " + [r.content, r.action && "(" + r.action + ")"].filter(Boolean).join(" ")),
        ].join("\n")), ...(threads.length ? [] : ["No comments."])].join("\n\n");
}
export async function changeDocComment(runtime, action, link, value) {
    const id = documentId(link), thread = new URL(link).searchParams.get("disco") ?? "";
    const url = threadUrl(id, thread), path = "/" + id + "/comments/" + thread;
    if (action === "delete-reply") {
        if (!value || !/^[\w.-]+$/.test(value) || value === "." || value === "..")
            throw new Error("Invalid reply ID.");
        await drive(runtime, path + "/replies/" + value, {}, { method: "DELETE" });
        return { message: "Deleted reply.", url };
    }
    if (action === "reply" && !value?.trim())
        throw new Error("Reply cannot be blank.");
    if (action !== "reply") {
        const state = await (await drive(runtime, path, { fields: "resolved" })).json();
        if (state.resolved === (action === "resolve"))
            return { message: "Thread is already " + (state.resolved ? "resolved." : "open."), url };
    }
    const reply = await (await drive(runtime, path + "/replies", { fields: "id" }, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reply" ? { content: value } : { action }),
    })).json();
    const command = "wire google-docs comments ";
    return { message: { reply: "Replied.", resolve: "Resolved.", reopen: "Reopened." }[action], url, replyId: reply.id,
        undo: command + (action === "reply" ? "delete-reply" : action === "resolve" ? "reopen" : "resolve") + " '" + url + "'" +
            (action === "reply" ? " " + "'" + reply.id.replaceAll("'", "'\\''") + "'" : "") };
}
//# sourceMappingURL=doc-comments.js.map