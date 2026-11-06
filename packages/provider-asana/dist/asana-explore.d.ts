import type { RuntimeCapabilities } from "wire-core";
type Named = Readonly<{
    gid: string;
    name: string;
}>;
type Team = {
    gid: string | null;
    name: string;
    projects: Named[];
};
export declare function listAsanaProjects(runtime: RuntimeCapabilities): Promise<{
    gid: string;
    name: string;
    teams: Team[];
}[]>;
export declare function listAsanaTasks(runtime: RuntimeCapabilities, project: string): Promise<readonly (Readonly<{
    gid: string;
    name: string;
}> & {
    completed: boolean;
})[]>;
export {};
//# sourceMappingURL=asana-explore.d.ts.map