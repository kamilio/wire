import { paginate } from "./asana-http.js";
export async function listAsanaProjects(runtime) {
    const workspaces = await paginate(runtime, "/workspaces", { limit: "100", opt_fields: "name" });
    const result = [];
    for (const { gid, name } of workspaces) {
        const projects = await paginate(runtime, `/workspaces/${gid}/projects`, { limit: "100", archived: "false", opt_fields: "name,team.name" });
        const teams = new Map();
        for (const project of projects) {
            const key = project.team?.gid ?? null;
            if (!teams.has(key))
                teams.set(key, { gid: key, name: project.team?.name ?? "No team", projects: [] });
            teams.get(key).projects.push({ gid: project.gid, name: project.name });
        }
        const byName = (a, b) => a.name.localeCompare(b.name);
        for (const team of teams.values())
            team.projects.sort(byName);
        result.push({ gid, name, teams: [...teams.values()].sort(byName) });
    }
    return result;
}
export async function listAsanaTasks(runtime, project) {
    if (!/^\d+$/.test(project))
        throw new Error("Expected a numeric Asana project ID.");
    return await paginate(runtime, `/projects/${project}/tasks`, { limit: "100", opt_fields: "name,completed" });
}
//# sourceMappingURL=asana-explore.js.map