import { defineService } from "wire-core";
import type { JsonObject, JsonValue } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";

function object(value: JsonValue): JsonObject {
  return value as JsonObject;
}

function asanaErrorMessage(body: JsonObject): string {
  const errors = body["errors"] as readonly JsonObject[];
  return errors.map((error) => error["message"] as string).join("; ");
}

function asanaAuthError(): Error {
  return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}

async function asana(runtime: RuntimeCapabilities, path: string, parameters: Readonly<Record<string, string>>): Promise<JsonObject> {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const cookies = await runtime.cookies.loadSaved("asana");
  if (cookies === null) throw asanaAuthError();
  const response = await runtime.http.request(url, {
    headers: {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  const body = object(await response.json() as JsonValue);
  if (response.status === 401) throw asanaAuthError();
  if (!response.ok) throw new Error(`Asana API ${path} failed: HTTP ${response.status} ${asanaErrorMessage(body)}`);
  return body;
}

async function fetchTask(runtime: RuntimeCapabilities, identifier: string): Promise<JsonObject> {
  return object((await asana(runtime, `/tasks/${identifier}`, {
    opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,due_at,permalink_url,assignee,assignee.name,assignee.email,memberships.project.gid,memberships.project.name,memberships.section.name,projects.name,tags.name",
  }))["data"]!);
}

async function fetchStories(runtime: RuntimeCapabilities, identifier: string): Promise<readonly JsonValue[]> {
  const stories: JsonValue[] = [];
  let offset: string | undefined;
  do {
    const parameters: Record<string, string> = { limit: "100", opt_fields: "gid,type,text,created_at,created_by.name,created_by.email,resource_subtype" };
    if (offset !== undefined) parameters["offset"] = offset;
    const page = await asana(runtime, `/tasks/${identifier}/stories`, parameters);
    stories.push(...page["data"] as readonly JsonValue[]);
    const nextPage = page["next_page"] as JsonObject | null;
    offset = nextPage === null ? undefined : nextPage["offset"] as string;
  } while (offset !== undefined);
  return stories;
}

function taskIdentifier(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "app.asana.com") return undefined;
  if (parts[0] === "1" && parts.length >= 4 && parts[2] === "task") return parts[3]!;
  if (parts[0] === "1" && parts.length >= 6 && parts[2] === "project" && parts[4] === "task") return parts[5]!;
  if (parts[0] !== "0") return undefined;
  if (parts.length === 4 && parts[2] === "task") return parts[3]!;
  if (parts.length === 4 && parts[3] === "f" && !["home", "inbox", "search"].includes(parts[1]!)) return parts[2]!;
  if (parts.length === 3 && !["home", "inbox", "search"].includes(parts[1]!)) return parts[2]!;
  return undefined;
}

export const asanaTaskService = defineService<RuntimeCapabilities>({
  name: "asana-task",
  matches: (url) => taskIdentifier(url) !== undefined,
  parse: (url) => {
    return Object.freeze({ service: "asana-task", identifier: taskIdentifier(url)!, type: "task" });
  },
  fetch: async (runtime, _url, source) => {
    const task = await fetchTask(runtime, source.identifier);
    const stories = await fetchStories(runtime, source.identifier);
    const assignee = task["assignee"] as JsonObject | null;
    const lines = [`# ${task["name"] as string}`, "", `- Source: ${task["permalink_url"] as string}`, `- Completed: ${task["completed"] as boolean ? "True" : "False"}`];
    if (assignee !== null) lines.push(`- Assignee: ${assignee["name"] as string}`);
    lines.push("", task["notes"] as string);
    if (stories.length > 0) {
      lines.push("", "## Activity", "");
      for (const value of stories) {
        const story = object(value);
        const createdBy = story["created_by"] as JsonObject | null;
        lines.push(`- ${story["created_at"] as string} — ${createdBy === null ? "System" : createdBy["name"] as string}: ${story["text"] as string}`);
      }
    }
    return Object.freeze({ title: task["name"] as string, markdown: `${lines.join("\n").trimEnd()}\n`, data: { task, stories } });
  },
});
