import type { JsonObject, JsonValue } from "wire-core";

type Kind = "project" | "section" | "milestone" | "task" | "subtask";

export type AsanaEntity = Readonly<{
  key: string;
  gid: string | null;
  kind: Kind;
  name: string;
  completed: boolean;
  parent: string | null;
  section: string | null;
  milestone: string | null;
  order: number;
}>;

export type AsanaDocument = Readonly<{
  projectGid: string;
  projectUrl: string;
  entities: readonly AsanaEntity[];
}>;

export type AsanaChange = Readonly<{
  operation: "create" | "delete" | "update";
  key: string;
  field: string | null;
  value: AsanaEntity | JsonValue | null;
}>;

function gidFromUrl(value: string): string {
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  const task = parts.indexOf("task");
  if (task !== -1) return parts[task + 1]!;
  const project = parts.indexOf("project");
  if (project !== -1) return parts[project + 1]!;
  if (parts.at(-1) === "list") return parts.at(-2)!;
  return parts.at(-1) === "f" ? parts.at(-2)! : parts.at(-1)!;
}

function taskUrl(projectGid: string, gid: string): string {
  return `https://app.asana.com/0/${projectGid}/task/${gid}`;
}

function encodeName(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function decodeName(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === "n") {
      decoded += "\n";
      index += 1;
    } else if (value[index] === "\\" && value[index + 1] === "\\") {
      decoded += "\\";
      index += 1;
    } else if (value[index] === "\\" && (value[index + 1] === "[" || value[index + 1] === "]")) {
      decoded += value[index + 1]!;
      index += 1;
    } else decoded += value[index]!;
  }
  return decoded;
}

function linked(line: string): Readonly<{ name: string; gid: string | null }> {
  const match = line.match(/^\[((?:\\.|[^\]\\])*)\]\((https:\/\/app\.asana\.com\/[^)]+)\)$/);
  return match === null ? { name: decodeName(line.trim()), gid: null } : { name: decodeName(match[1]!), gid: gidFromUrl(match[2]!) };
}

function checkbox(line: string): Readonly<{ completed: boolean; value: string }> {
  const match = line.match(/^\[([ xX])\]\s+(.+)$/);
  return match === null ? { completed: false, value: line } : { completed: match[1]!.toLowerCase() === "x", value: match[2]! };
}

function key(kind: Kind, gid: string | null, index: number): string {
  return gid === null ? `new:${kind}:${index}` : `${kind}:${gid}`;
}

export function parseAsanaMarkdown(markdown: string): AsanaDocument {
  const entities: AsanaEntity[] = [];
  let projectGid = "";
  let projectUrl = "";
  let section: string | null = null;
  let task: string | null = null;
  let milestone: string | null = null;
  let topOrder = 0;
  let subtaskOrder = 0;
  let created = 0;
  const identities = new Set<string>();
  for (const [lineIndex, line] of markdown.split("\n").entries()) {
    if (line === "") continue;
    if (line.startsWith("# ")) {
      const value = linked(line.slice(2));
      if (value.gid === null || projectGid !== "") throw new Error(`Invalid Asana project heading at line ${lineIndex + 1}.`);
      projectGid = value.gid!;
      projectUrl = `https://app.asana.com/0/${projectGid}/list`;
      entities.push({ key: `project:${projectGid}`, gid: projectGid, kind: "project", name: value.name, completed: false, parent: null, section: null, milestone: null, order: 0 });
    } else if (line.startsWith("## ")) {
      if (projectGid === "") throw new Error(`Asana section appears before the project at line ${lineIndex + 1}.`);
      const match = line.slice(3).match(/^(.*?)\s*<!--\s*asana-section:([^\s]+)\s*-->$/);
      const gid = match === null ? null : match[2]!;
      const name = decodeName(match === null ? line.slice(3).trim() : match[1]!.trim());
      section = key("section", gid, ++created);
      task = null;
      milestone = null;
      topOrder = 0;
      entities.push({ key: section, gid, kind: "section", name, completed: false, parent: null, section: null, milestone: null, order: entities.filter((entity) => entity.kind === "section").length });
    } else if (line.startsWith("### ")) {
      if (section === null) throw new Error(`Asana milestone appears outside a section at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(4));
      const value = linked(state.value);
      const entityKey = key("milestone", value.gid, ++created);
      milestone = entityKey;
      entities.push({ key: entityKey, gid: value.gid, kind: "milestone", name: value.name, completed: state.completed, parent: null, section, milestone: null, order: topOrder++ });
      task = null;
    } else if (line.startsWith("- ")) {
      if (section === null) throw new Error(`Asana task appears outside a section at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(2));
      const value = linked(state.value);
      task = key("task", value.gid, ++created);
      subtaskOrder = 0;
      entities.push({ key: task, gid: value.gid, kind: "task", name: value.name, completed: state.completed, parent: null, section, milestone, order: topOrder++ });
    } else if (line.startsWith("  - ")) {
      if (task === null) throw new Error(`Asana subtask appears without a task at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(4));
      const value = linked(state.value);
      entities.push({ key: key("subtask", value.gid, ++created), gid: value.gid, kind: "subtask", name: value.name, completed: state.completed, parent: task, section, milestone, order: subtaskOrder++ });
    } else throw new Error(`Unsupported Asana Markdown at line ${lineIndex + 1}: ${line}`);
    const identity = entities.at(-1)!.gid;
    if (identity !== null) {
      if (identities.has(identity)) throw new Error(`Duplicate Asana identity ${identity}.`);
      identities.add(identity);
    }
  }
  if (projectGid === "") throw new Error("Missing Asana project heading.");
  return { projectGid, projectUrl, entities };
}

export function renderAsanaMarkdown(document: AsanaDocument): string {
  const project = document.entities.find((entity) => entity.kind === "project")!;
  const lines = [`# [${encodeName(project.name)}](${document.projectUrl})`, ""];
  for (const section of document.entities.filter((entity) => entity.kind === "section").sort((left, right) => left.order - right.order)) {
    lines.push(`## ${encodeName(section.name)}${section.gid === null ? "" : ` <!-- asana-section:${section.gid} -->`}`, "");
    const top = document.entities.filter((entity) => (entity.kind === "milestone" || entity.kind === "task") && entity.section === section.key).sort((left, right) => left.order - right.order);
    for (const entity of top) {
      const label = entity.gid === null ? encodeName(entity.name) : `[${encodeName(entity.name)}](${taskUrl(document.projectGid, entity.gid)})`;
      if (entity.kind === "milestone") lines.push(`### ${entity.completed ? "[x] " : ""}${label}`, "");
      else {
        lines.push(`- [${entity.completed ? "x" : " "}] ${label}`);
        for (const subtask of document.entities.filter((candidate) => candidate.kind === "subtask" && candidate.parent === entity.key).sort((left, right) => left.order - right.order)) {
          const child = subtask.gid === null ? encodeName(subtask.name) : `[${encodeName(subtask.name)}](${taskUrl(document.projectGid, subtask.gid)})`;
          lines.push(`  - [${subtask.completed ? "x" : " "}] ${child}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function values(document: AsanaDocument): ReadonlyMap<string, AsanaEntity> {
  return new Map(document.entities.filter((entity) => entity.gid !== null).map((entity) => [entity.key, entity]));
}

export function asanaChanges(base: AsanaDocument, other: AsanaDocument): readonly AsanaChange[] {
  const baseValues = values(base);
  const otherValues = values(other);
  const changes: AsanaChange[] = [];
  for (const entity of other.entities) {
    if (entity.gid === null) changes.push({ operation: "create", key: entity.key, field: null, value: entity });
    else if (!baseValues.has(entity.key)) changes.push({ operation: "create", key: entity.key, field: null, value: entity });
    else {
      const previous = baseValues.get(entity.key)!;
      for (const field of ["name", "completed", "parent", "section", "milestone"] as const) {
        if (previous[field] !== entity[field]) changes.push({ operation: "update", key: entity.key, field, value: entity[field] });
      }
    }
  }
  for (const entity of base.entities) if (entity.gid !== null && !otherValues.has(entity.key)) changes.push({ operation: "delete", key: entity.key, field: null, value: entity });
  const shared = new Set([...baseValues.keys()].filter((entityKey) => otherValues.has(entityKey)));
  const siblingGroup = (entity: AsanaEntity) => entity.kind === "section" ? "sections" : entity.kind === "subtask" ? `subtasks:${entity.parent}` : `top:${entity.section}`;
  const groups = new Set([...base.entities, ...other.entities].filter((entity) => shared.has(entity.key)).map(siblingGroup));
  for (const group of groups) {
    const ordered = (document: AsanaDocument) => document.entities.filter((entity) => shared.has(entity.key) && siblingGroup(entity) === group).sort((left, right) => left.order - right.order).map((entity) => entity.key);
    const before = ordered(base);
    const after = ordered(other);
    for (const [index, entityKey] of after.entries()) if (before[index] !== entityKey) changes.push({ operation: "update", key: entityKey!, field: "order", value: index === 0 ? null : after[index - 1]! });
  }
  return changes;
}

function changePath(change: AsanaChange): string {
  return change.operation === "update" ? `${change.key}.${change.field}` : change.key;
}

export function asanaConflicts(local: readonly AsanaChange[], remote: readonly AsanaChange[]): readonly string[] {
  const remotePaths = new Map(remote.map((change) => [changePath(change), change]));
  const remoteEntities = new Set(remote.map((change) => change.key));
  const conflicts: string[] = [];
  for (const change of local) {
    const path = changePath(change);
    const other = remotePaths.get(path);
    if (other !== undefined) {
      if (other.operation !== change.operation || JSON.stringify(other.value) !== JSON.stringify(change.value)) conflicts.push(path);
    } else if ((change.operation === "delete" || change.operation === "create") && remoteEntities.has(change.key)) conflicts.push(change.key);
    else if (remote.some((candidate) => candidate.key === change.key && candidate.operation === "delete")) conflicts.push(change.key);
  }
  return [...new Set(conflicts)].sort();
}

export function asanaDocument(value: JsonValue): AsanaDocument {
  return value as AsanaDocument;
}

export function asanaSnapshot(document: AsanaDocument): JsonObject {
  return document as unknown as JsonObject;
}
