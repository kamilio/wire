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
export declare function parseAsanaMarkdown(markdown: string): AsanaDocument;
export declare function renderAsanaMarkdown(document: AsanaDocument): string;
export declare function asanaChanges(base: AsanaDocument, other: AsanaDocument): readonly AsanaChange[];
export declare function asanaConflicts(local: readonly AsanaChange[], remote: readonly AsanaChange[]): readonly string[];
export declare function asanaDocument(value: JsonValue): AsanaDocument;
export declare function asanaSnapshot(document: AsanaDocument): JsonObject;
export {};
//# sourceMappingURL=asana-sync.d.ts.map