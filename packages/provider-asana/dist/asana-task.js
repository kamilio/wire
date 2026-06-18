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
    const response = await runtime.http.request(url, {
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
        opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,due_at,permalink_url,assignee,assignee.name,assignee.email,memberships.project.gid,memberships.project.name,memberships.section.name,projects.name,tags.name",
    }))["data"]);
}
async function fetchStories(runtime, identifier) {
    const stories = [];
    let offset;
    do {
        const parameters = { limit: "100", opt_fields: "gid,type,text,created_at,created_by.name,created_by.email,resource_subtype" };
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
    fetch: async (runtime, _url, source) => {
        const task = await fetchTask(runtime, source.identifier);
        const stories = await fetchStories(runtime, source.identifier);
        const assignee = task["assignee"];
        const lines = [`# ${task["name"]}`, "", `- Source: ${task["permalink_url"]}`, `- Completed: ${task["completed"] ? "True" : "False"}`];
        if (assignee !== null)
            lines.push(`- Assignee: ${assignee["name"]}`);
        lines.push("", task["notes"]);
        if (stories.length > 0) {
            lines.push("", "## Activity", "");
            for (const value of stories) {
                const story = object(value);
                const createdBy = story["created_by"];
                lines.push(`- ${story["created_at"]} — ${createdBy === null ? "System" : createdBy["name"]}: ${story["text"]}`);
            }
        }
        return Object.freeze({ title: task["name"], markdown: `${lines.join("\n").trimEnd()}\n`, data: { task, stories } });
    },
});
//# sourceMappingURL=asana-task.js.map