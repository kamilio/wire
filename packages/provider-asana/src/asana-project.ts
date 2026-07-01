import { asanaChanges, asanaConflicts, asanaDocument, asanaSnapshot, parseAsanaMarkdown, renderAsanaMarkdown, type AsanaChange, type AsanaDocument, type AsanaEntity } from "./asana-sync.js";
import { defineService } from "wire-core";
import type { FetchedDocument, JsonObject, JsonValue, Source } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";

const projectViews = new Set(["board", "calendar", "files", "forms", "gantt", "list", "overview", "timeline", "workflow"]);

function object(value: JsonValue): JsonObject {
  return value as JsonObject;
}

function projectIdentifier(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "app.asana.com") return undefined;
  if (parts[0] === "0" && (parts.length === 3 || parts.length === 4) && projectViews.has(parts[2]!)) return parts[1]!;
  if (parts[0] === "1" && (parts.length === 5 || parts.length === 6) && parts[2] === "project" && projectViews.has(parts[4]!)) return parts[3]!;
  return undefined;
}

function asanaAuthError(): Error {
  return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}

async function request(runtime: RuntimeCapabilities, method: string, path: string, parameters?: Readonly<Record<string, string>>, data?: JsonObject): Promise<JsonObject> {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  if (parameters !== undefined) for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const cookies = await runtime.cookies.loadSaved("asana");
  if (cookies === null) throw asanaAuthError();
  const response = await runtime.http.request(url, {
    method,
    headers: {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    ...(data === undefined ? {} : { body: JSON.stringify({ data }) }),
  });
  if (response.status === 401) throw asanaAuthError();
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return object(await response.json() as JsonValue);
}

async function paginate(runtime: RuntimeCapabilities, path: string, parameters: Readonly<Record<string, string>>): Promise<readonly JsonObject[]> {
  const values: JsonObject[] = [];
  let offset: string | undefined;
  do {
    const page = await request(runtime, "GET", path, offset === undefined ? parameters : { ...parameters, offset });
    values.push(...(page["data"] as readonly JsonValue[]).map(object));
    const nextPage = page["next_page"] as JsonObject | null;
    offset = nextPage === null ? undefined : nextPage["offset"] as string;
  } while (offset !== undefined);
  return values;
}

async function fetchDocument(runtime: RuntimeCapabilities, url: string, source: Source): Promise<FetchedDocument> {
  const project = object((await request(runtime, "GET", `/projects/${source.identifier}`, { opt_fields: "gid,name,permalink_url" }))["data"]!);
  const sections = await paginate(runtime, `/projects/${source.identifier}/sections`, { limit: "100", opt_fields: "gid,name" });
  const tasks = await paginate(runtime, `/projects/${source.identifier}/tasks`, { limit: "100", opt_fields: "gid,name,completed,parent,resource_subtype,permalink_url,memberships.project.gid,memberships.section.gid" });
  const entities: AsanaEntity[] = [{ key: `project:${source.identifier}`, gid: source.identifier, kind: "project", name: project["name"] as string, completed: false, parent: null, section: null, milestone: null, order: 0 }];
  const memberships = tasks.map((task) => (task["memberships"] as readonly JsonValue[]).map(object).find((value) => object(value["project"]!)["gid"] === source.identifier)!);
  const projectSections = tasks.some((_task, index) => memberships[index]!["section"] === null) ? [...sections, { gid: "__unsectioned__", name: "No section" }] : sections;
  for (const [sectionOrder, section] of projectSections.entries()) {
    const sectionGid = section["gid"] as string;
    const sectionKey = `section:${sectionGid}`;
    entities.push({ key: sectionKey, gid: sectionGid, kind: "section", name: section["name"] as string, completed: false, parent: null, section: null, milestone: null, order: sectionOrder });
    let milestone: string | null = null;
    let order = 0;
    for (const [taskIndex, task] of tasks.entries()) {
      const membership = memberships[taskIndex]!;
      const membershipSection = membership["section"] === null ? "__unsectioned__" : object(membership["section"]!)["gid"] as string;
      if (membershipSection !== sectionGid || task["parent"] !== null) continue;
      const taskGid = task["gid"] as string;
      const kind = task["resource_subtype"] === "milestone" ? "milestone" : "task";
      const taskKey = `${kind}:${taskGid}`;
      if (kind === "milestone") milestone = taskKey;
      entities.push({ key: taskKey, gid: taskGid, kind, name: task["name"] as string, completed: task["completed"] as boolean, parent: null, section: sectionKey, milestone: kind === "milestone" ? null : milestone, order: order++ });
      if (kind === "task") {
        const subtasks = await paginate(runtime, `/tasks/${taskGid}/subtasks`, { limit: "100", opt_fields: "gid,name,completed,parent,resource_subtype,permalink_url" });
        for (const [subtaskOrder, subtask] of subtasks.entries()) {
          const subtaskGid = subtask["gid"] as string;
          entities.push({ key: `subtask:${subtaskGid}`, gid: subtaskGid, kind: "subtask", name: subtask["name"] as string, completed: subtask["completed"] as boolean, parent: taskKey, section: sectionKey, milestone, order: subtaskOrder });
        }
      }
    }
  }
  const document = { projectGid: source.identifier, projectUrl: url, entities } satisfies AsanaDocument;
  return Object.freeze({ title: project["name"] as string, markdown: renderAsanaMarkdown(document), data: asanaSnapshot(document) });
}

function entityMap(document: AsanaDocument): ReadonlyMap<string, AsanaEntity> {
  return new Map(document.entities.map((entity) => [entity.key, entity]));
}

function gid(entity: AsanaEntity, created: ReadonlyMap<string, string>): string {
  return entity.gid === null ? created.get(entity.key)! : entity.gid;
}

function referenceGid(key: string | null, entities: ReadonlyMap<string, AsanaEntity>, created: ReadonlyMap<string, string>): string | null {
  return key === null ? null : gid(entities.get(key)!, created);
}

function placement(previous: string | null, next: string | null): JsonObject {
  if (previous !== null) return { insert_after: previous };
  if (next !== null) return { insert_before: next };
  return {};
}

async function createEntity(runtime: RuntimeCapabilities, document: AsanaDocument, entity: AsanaEntity, entities: ReadonlyMap<string, AsanaEntity>, created: Map<string, string>): Promise<void> {
  if (entity.gid !== null) return;
  let value: JsonObject;
  if (entity.kind === "section") value = object((await request(runtime, "POST", `/projects/${document.projectGid}/sections`, undefined, { name: entity.name }))["data"]!);
  else if (entity.kind === "subtask") value = object((await request(runtime, "POST", `/tasks/${referenceGid(entity.parent, entities, created)!}/subtasks`, undefined, { name: entity.name, completed: entity.completed }))["data"]!);
  else value = object((await request(runtime, "POST", "/tasks", undefined, { name: entity.name, completed: entity.completed, projects: [document.projectGid], ...(entity.kind === "milestone" ? { resource_subtype: "milestone" } : {}) }))["data"]!);
  created.set(entity.key, value["gid"] as string);
}

async function updateEntity(runtime: RuntimeCapabilities, change: AsanaChange, entities: ReadonlyMap<string, AsanaEntity>): Promise<void> {
  const entity = entities.get(change.key)!;
  if (change.field === "name") {
    if (entity.kind === "project") await request(runtime, "PUT", `/projects/${entity.gid!}`, undefined, { name: change.value as string });
    else if (entity.kind === "section") await request(runtime, "PUT", `/sections/${entity.gid!}`, undefined, { name: change.value as string });
    else await request(runtime, "PUT", `/tasks/${entity.gid!}`, undefined, { name: change.value as string });
  } else if (change.field === "completed") await request(runtime, "PUT", `/tasks/${entity.gid!}`, undefined, { completed: change.value as boolean });
}

function siblings(document: AsanaDocument, entity: AsanaEntity): readonly AsanaEntity[] {
  return document.entities.filter((candidate) => entity.kind === "section"
    ? candidate.kind === "section"
    : entity.kind === "subtask"
      ? candidate.kind === "subtask" && candidate.parent === entity.parent
      : (candidate.kind === "task" || candidate.kind === "milestone") && candidate.section === entity.section).sort((left, right) => left.order - right.order);
}

async function placeEntity(runtime: RuntimeCapabilities, document: AsanaDocument, entity: AsanaEntity, entities: ReadonlyMap<string, AsanaEntity>, created: ReadonlyMap<string, string>, placementKeys: ReadonlySet<string>, placed: ReadonlySet<string>): Promise<void> {
  if (entity.kind === "project") return;
  const entityGid = gid(entity, created);
  const ordered = siblings(document, entity);
  const index = ordered.findIndex((candidate) => candidate.key === entity.key);
  const previousEntity = ordered.slice(0, index).reverse().find((candidate) => !placementKeys.has(candidate.key) || placed.has(candidate.key));
  const nextEntity = ordered.slice(index + 1).find((candidate) => !placementKeys.has(candidate.key));
  const previous = previousEntity === undefined ? null : gid(previousEntity, created);
  const next = nextEntity === undefined ? null : gid(nextEntity, created);
  if (entity.kind === "section") {
    if (previous !== null) await request(runtime, "POST", `/projects/${document.projectGid}/sections/insert`, undefined, { section: entityGid, after_section: previous });
    else if (next !== null) await request(runtime, "POST", `/projects/${document.projectGid}/sections/insert`, undefined, { section: entityGid, before_section: next });
  } else if (entity.kind === "subtask") await request(runtime, "POST", `/tasks/${entityGid}/setParent`, undefined, { parent: referenceGid(entity.parent, entities, created)!, ...placement(previous, next) });
  else {
    const sectionGid = referenceGid(entity.section, entities, created)!;
    if (sectionGid === "__unsectioned__") await request(runtime, "POST", `/tasks/${entityGid}/addProject`, undefined, { project: document.projectGid, ...placement(previous, next) });
    else await request(runtime, "POST", `/sections/${sectionGid}/addTask`, undefined, { task: entityGid, ...placement(previous, next) });
  }
}

async function deleteEntity(runtime: RuntimeCapabilities, entity: AsanaEntity): Promise<void> {
  if (entity.kind === "section" && entity.gid === "__unsectioned__") return;
  if (entity.kind === "section") await request(runtime, "DELETE", `/sections/${entity.gid!}`);
  else if (entity.kind !== "project") await request(runtime, "DELETE", `/tasks/${entity.gid!}`);
}

async function push(runtime: RuntimeCapabilities, document: AsanaDocument, changes: readonly AsanaChange[]): Promise<void> {
  const destructiveDeletes = changes.filter((change) => change.operation === "delete" && (change.value as AsanaEntity).kind !== "section" && (change.value as AsanaEntity).kind !== "project").map((change) => change.value as AsanaEntity);
  if (destructiveDeletes.length > 0) throw new Error(`Asana task removal is not supported from project Markdown: ${destructiveDeletes.map((entity) => entity.name).join(", ")}`);
  const entities = entityMap(document);
  const created = new Map<string, string>();
  for (const kind of ["section", "milestone", "task", "subtask"] as const) for (const change of changes) if (change.operation === "create" && (change.value as AsanaEntity).kind === kind) await createEntity(runtime, document, change.value as AsanaEntity, entities, created);
  for (const change of changes) if (change.operation === "update") await updateEntity(runtime, change, entities);
  const placementKeys = new Set(changes.filter((change) => change.operation === "create" || change.field === "parent" || change.field === "section" || change.field === "milestone" || change.field === "order").map((change) => change.key));
  const placed = new Set<string>();
  for (const entity of document.entities) if (placementKeys.has(entity.key)) {
    await placeEntity(runtime, document, entity, entities, created, placementKeys, placed);
    placed.add(entity.key);
  }
  for (const kind of ["subtask", "task", "milestone", "section"] as const) for (const change of changes) if (change.operation === "delete" && (change.value as AsanaEntity).kind === kind) await deleteEntity(runtime, change.value as AsanaEntity);
}

export const asanaProjectService = defineService<RuntimeCapabilities>({
  name: "asana-project",
  matches: (url) => projectIdentifier(url) !== undefined,
  parse: (url) => {
    return Object.freeze({ service: "asana-project", identifier: projectIdentifier(url)!, type: "project" });
  },
  fetch: fetchDocument,
  synchronize: async (runtime, url, source, baseValue, markdown) => {
    const base = asanaDocument(baseValue);
    const local = parseAsanaMarkdown(markdown);
    if (local.projectGid !== base.projectGid) throw new Error(`Asana project identity changed from ${base.projectGid} to ${local.projectGid}.`);
    const remote = asanaDocument((await fetchDocument(runtime, url, source)).data);
    const known = new Set([...base.entities, ...remote.entities].map((entity) => entity.gid).filter((value) => value !== null));
    const unknown = local.entities.find((entity) => entity.gid !== null && !known.has(entity.gid));
    if (unknown !== undefined) throw new Error(`Unknown Asana identity ${unknown.gid}. New entries must not include a URL.`);
    const localChanges = asanaChanges(base, local);
    const remoteChanges = asanaChanges(base, remote);
    const conflicts = asanaConflicts(localChanges, remoteChanges);
    if (conflicts.length > 0) throw new Error(`Conflicting Asana edits: ${conflicts.join(", ")}`);
    const remotePaths = new Map(remoteChanges.map((change) => [`${change.key}.${change.field}`, change]));
    const pending = localChanges.filter((change) => {
      const remoteChange = remotePaths.get(`${change.key}.${change.field}`);
      return remoteChange === undefined || JSON.stringify(remoteChange.value) !== JSON.stringify(change.value);
    });
    await push(runtime, local, pending);
    return fetchDocument(runtime, url, source);
  },
});
