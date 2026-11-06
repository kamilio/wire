import type { RuntimeCapabilities } from "wire-core";
import { paginate, request } from "./asana-http.js";

type Named = Readonly<{ gid: string; name: string }>;

export async function listAsanaSections(runtime: RuntimeCapabilities, project: string) {
  if (!/^\d+$/.test(project)) throw new Error("Expected a numeric Asana project ID.");
  return await paginate(runtime, `/projects/${project}/sections`, { limit: "100", opt_fields: "gid,name" }) as readonly Named[];
}

export async function showAsanaProject(runtime: RuntimeCapabilities, project: string) {
  const sections = await listAsanaSections(runtime, project);
  const { data } = await request(runtime, "GET", `/projects/${project}`, { opt_fields: "gid,name,permalink_url" });
  return { ...data as Named & { permalink_url: string }, sections };
}

export async function resolveAsanaSection(runtime: RuntimeCapabilities, project: string, section: string) {
  const value = section?.trim();
  if (!value) throw new Error(`A section is required. See: wire asana projects show ${project}`);
  const choices = await listAsanaSections(runtime, project);
  const idMatch = choices.find(({ gid }) => gid === value);
  if (idMatch) return idMatch;
  const matches = choices.filter(({ name }) => name.toLowerCase() === value.toLowerCase());
  if (matches.length === 1) return matches[0]!;
  const reason = matches.length ? `Multiple sections named "${value}"; use a section ID.` : `No section "${value}" in project ${project}.`;
  throw new Error(`${reason} See: wire asana projects show ${project}`);
}

export async function moveAsanaTask(runtime: RuntimeCapabilities, task: string, project: string, section: string) {
  if (!/^\d+$/.test(task)) throw new Error("Expected a numeric Asana task ID.");
  const destination = await resolveAsanaSection(runtime, project, section);
  const { data } = await request(runtime, "GET", `/tasks/${task}`, { opt_fields: "memberships.project.gid,memberships.section.gid" });
  const { memberships } = data as { memberships: { project: Named; section: Named | null }[] };
  const current = memberships.find((membership) => membership.project.gid === project);
  if (!current) throw new Error(`Task ${task} is not in project ${project}.`);
  if (current.section?.gid !== destination.gid) await request(runtime, "POST", `/sections/${destination.gid}/addTask`, undefined, { task });
  return { task, project, section: destination };
}
