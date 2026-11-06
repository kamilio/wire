import type { RuntimeCapabilities } from "wire-core";
export declare function listAsanaSections(runtime: RuntimeCapabilities, project: string): Promise<readonly Readonly<{
    gid: string;
    name: string;
}>[]>;
export declare function showAsanaProject(runtime: RuntimeCapabilities, project: string): Promise<{
    sections: readonly Readonly<{
        gid: string;
        name: string;
    }>[];
    gid: string;
    name: string;
    permalink_url: string;
}>;
export declare function resolveAsanaSection(runtime: RuntimeCapabilities, project: string, section: string): Promise<Readonly<{
    gid: string;
    name: string;
}>>;
export declare function moveAsanaTask(runtime: RuntimeCapabilities, task: string, project: string, section: string): Promise<{
    task: string;
    project: string;
    section: Readonly<{
        gid: string;
        name: string;
    }>;
}>;
//# sourceMappingURL=asana-sections.d.ts.map