import { asanaMarkdown, asanaRichText } from "./asana-markdown.js";
import { resolveAsanaSection } from "./asana-sections.js";
import { asanaHttp, request } from "./asana-http.js";
import { defineService } from "wire-core";
function object(value) {
    return value;
}
function asanaErrorMessage(body) {
    const errors = body["errors"];
    return errors.map((error) => error["message"]).join("; ");
}
function asanaAuthError() {
    return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}
async function asana(runtime, path, parameters) {
    const url = new URL(`https://app.asana.com/api/1.0${path}`);
    for (const [name, value] of Object.entries(parameters))
        url.searchParams.set(name, value);
    const cookies = await runtime.cookies.loadSaved("asana");
    if (cookies === null)
        throw asanaAuthError();
    const response = await asanaHttp(runtime, url, {
        headers: {
            Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
    });
    const body = object(await response.json());
    if (response.status === 401)
        throw asanaAuthError();
    if (!response.ok)
        throw new Error(`Asana API ${path} failed: HTTP ${response.status} ${asanaErrorMessage(body)}`);
    return body;
}
async function fetchTask(runtime, identifier) {
    return object((await asana(runtime, `/tasks/${identifier}`, {
        opt_fields: "gid,name,notes,html_notes,completed,completed_at,created_at,modified_at,due_on,due_at,permalink_url,assignee,assignee.name,assignee.email,memberships.project.gid,memberships.project.name,memberships.section.name,projects.name,tags.name,start_on,start_at,resource_subtype,approval_status,custom_type.name,custom_type_status_option.name,custom_fields.name,custom_fields.resource_subtype,custom_fields.display_value,custom_fields.is_value_read_only,custom_fields.enabled,custom_fields.enum_options.name,custom_fields.enum_options.enabled,custom_fields.text_value,custom_fields.html_text_value,custom_fields.number_value,custom_fields.enum_value.name,custom_fields.multi_enum_values.name,custom_fields.date_value,custom_fields.people_value.name,custom_fields.reference_value.name",
    }))["data"]);
}
async function fetchStories(runtime, identifier) {
    const stories = [];
    let offset;
    do {
        const parameters = { limit: "100", opt_fields: "gid,type,text,html_text,is_editable,comment_gid,anchor_gid,created_at,created_by.name,created_by.email,resource_subtype" };
        if (offset !== undefined)
            parameters["offset"] = offset;
        const page = await asana(runtime, `/tasks/${identifier}/stories`, parameters);
        stories.push(...page["data"]);
        const nextPage = page["next_page"];
        offset = nextPage === null ? undefined : nextPage["offset"];
    } while (offset !== undefined);
    return stories;
}
function taskIdentifier(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "app.asana.com")
        return undefined;
    if (parts[0] === "1" && parts.length >= 4 && parts[2] === "task")
        return parts[3];
    if (parts[0] === "1" && parts.length >= 6 && parts[2] === "project" && parts[4] === "task")
        return parts[5];
    if (parts[0] !== "0")
        return undefined;
    if (parts.length === 4 && parts[2] === "task")
        return parts[3];
    if (parts.length === 4 && parts[3] === "f" && !["home", "inbox", "search"].includes(parts[1]))
        return parts[2];
    if (parts.length === 3 && !["home", "inbox", "search"].includes(parts[1]))
        return parts[2];
    return undefined;
}
export const asanaTaskService = defineService({
    name: "asana-task",
    matches: (url) => taskIdentifier(url) !== undefined,
    parse: (url) => {
        return Object.freeze({ service: "asana-task", identifier: taskIdentifier(url), type: "task" });
    },
    fetch: (runtime, _url, source) => showAsanaTask(runtime, source.identifier),
});
export async function showAsanaTask(runtime, identifier) {
    if (!/^\d+$/.test(identifier))
        throw new Error("Expected a numeric Asana task ID.");
    const task = await fetchTask(runtime, identifier);
    const stories = await fetchStories(runtime, identifier);
    const assignee = task["assignee"];
    const lines = [`# ${task["name"]}`, "", `- Source: ${task["permalink_url"]}`, `- Completed: ${task["completed"] ? "True" : "False"}`];
    if (assignee !== null)
        lines.push(`- Assignee: ${assignee["name"]}${assignee["email"] ? ` <${assignee["email"]}>` : ""}`);
    for (const { project, section } of task["memberships"] ?? []) {
        lines.push(`- Project: ${project["name"]} → ${section?.["name"] ?? "No section"}`);
    }
    for (const [label, value] of [
        ["Starts", task["start_at"] ?? task["start_on"]], ["Due", task["due_at"] ?? task["due_on"]],
        ["Approval", task["resource_subtype"] === "approval" ? task["approval_status"] : null],
        ["Task type", task["custom_type"]?.["name"]],
        ["Status", task["custom_type_status_option"]?.["name"]],
    ])
        if (value)
            lines.push(`- ${label}: ${value}`);
    const bodyMarkdown = task["html_notes"] ? asanaMarkdown(task["html_notes"]) : task["notes"];
    lines.push("", bodyMarkdown);
    const fields = task["custom_fields"];
    if (fields?.length) {
        lines.push("", "## Custom fields", "");
        for (const field of fields) {
            const readOnly = field["is_value_read_only"] || field["enabled"] === false;
            lines.push(`- ${field["name"]} (${field["gid"]}, ${field["resource_subtype"]}${readOnly ? ", read-only" : ""}): ${field["html_text_value"] ? asanaMarkdown(field["html_text_value"]) : field["display_value"] ?? "—"}`);
        }
    }
    const comments = [];
    const activity = [];
    const storyData = stories.map((value) => {
        const story = object(value);
        const isComment = story["type"] === "comment" || story["resource_subtype"] === "comment_added";
        const author = story["created_by"]?.["name"] ?? "System";
        const id = isComment ? ` [${story["gid"]}${story["is_editable"] ? ", editable" : ""}]` : "";
        if (isComment) {
            const body = story["html_text"] ? asanaMarkdown(story["html_text"]) : story["text"] ?? "";
            comments.push(`**${author}** · ${story["created_at"]}${id}\n\n${body}`);
            return { ...story, body_markdown: body };
        }
        activity.push(`- ${story["created_at"]} — ${author}: ${story["text"] ?? ""}`);
        return story;
    });
    if (comments.length)
        lines.push("", "## Comments", "", comments.join("\n\n"));
    if (activity.length)
        lines.push("", "## Activity", "", ...activity);
    return Object.freeze({ title: task["name"], markdown: `${lines.join("\n").trimEnd()}\n`, data: { task: { ...task, body_markdown: bodyMarkdown }, stories: storyData } });
}
export async function createAsanaTask(runtime, project, title, section, body, assignee) {
    if (!/^\d+$/.test(project))
        throw new Error("Expected a numeric Asana project ID.");
    if (!title.trim())
        throw new Error("Task title cannot be empty.");
    const destination = await resolveAsanaSection(runtime, project, section);
    const data = { name: title, projects: [project], memberships: [{ project, section: destination.gid }], ...(body === undefined ? {} : { html_notes: asanaRichText(body, "task") }), ...(assignee === undefined ? {} : { assignee }) };
    const task = object((await request(runtime, "POST", "/tasks", { opt_fields: "name,permalink_url,memberships.project.gid,memberships.section.gid,memberships.section.name" }, data))["data"]);
    const memberships = task["memberships"];
    const placement = memberships?.find((membership) => membership.project["gid"] === project);
    const actual = placement?.section ?? null;
    if (actual?.["gid"] === destination.gid)
        return { ...task, section: actual };
    const location = placement ? actual ? `"${actual["name"]}" (${actual["gid"]})` : "no section" : "an unconfirmed section";
    return { ...task, section: actual, warning: `Asana returned ${location} instead of "${destination.name}" (${destination.gid}). To correct this task: wire asana tasks move ${task["gid"]} --project ${project} --section ${destination.gid}` };
}
export async function editAsanaTask(runtime, task, fields) {
    if (!/^\d+$/.test(task))
        throw new Error("Expected a numeric Asana task ID.");
    if (!Object.keys(fields).length)
        throw new Error("No task fields to update.");
    const data = { ...fields };
    if ("html_notes" in data || "html_custom_fields" in data)
        throw new Error("Use Markdown in notes or custom_fields instead of HTML.");
    if ("notes" in data) {
        if (typeof data["notes"] !== "string")
            throw new Error("Task notes must be Markdown text.");
        data["html_notes"] = asanaRichText(data["notes"], "task");
        delete data["notes"];
    }
    const custom = data["custom_fields"];
    if (custom && typeof custom === "object" && !Array.isArray(custom) && Object.values(custom).some(v => typeof v === "string")) {
        const schema = object((await asana(runtime, `/tasks/${task}`, { opt_fields: "custom_fields.resource_subtype" }))["data"]);
        const values = { ...custom };
        const rich = {};
        for (const field of schema["custom_fields"]) {
            const key = field["gid"];
            const value = values[key];
            if (field["resource_subtype"] !== "text" || typeof value !== "string")
                continue;
            rich[key] = asanaRichText(value, "field");
            delete values[key];
        }
        if (Object.keys(rich).length) {
            data["html_custom_fields"] = rich;
            if (Object.keys(values).length)
                data["custom_fields"] = values;
            else
                delete data["custom_fields"];
        }
    }
    return object((await request(runtime, "PUT", `/tasks/${task}`, { opt_fields: "name,permalink_url" }, data))["data"]);
}
export async function addAsanaComment(runtime, task, body) {
    if (!/^\d+$/.test(task))
        throw new Error("Expected a numeric Asana task ID.");
    if (!body.trim())
        throw new Error("Comment body cannot be empty.");
    return object((await request(runtime, "POST", `/tasks/${task}/stories`, { opt_fields: "text" }, { html_text: asanaRichText(body, "comment") }))["data"]);
}
export async function editAsanaComment(runtime, comment, body) {
    if (!/^\d+$/.test(comment))
        throw new Error("Expected a numeric Asana comment ID.");
    if (!body.trim())
        throw new Error("Comment body cannot be empty.");
    return object((await request(runtime, "PUT", `/stories/${comment}`, { opt_fields: "text" }, { html_text: asanaRichText(body, "comment") }))["data"]);
}
//# sourceMappingURL=asana-task.js.map