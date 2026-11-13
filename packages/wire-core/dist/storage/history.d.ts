import type { FetchedDocument, Resource } from "../core/model.js";
export type HistoryEntry = {
    id: string;
    parents: string[];
    kind: "attach" | "local" | "remote" | "merge" | "resolve";
    at: string;
};
export type HistoryConflict = {
    base: string;
    local: string;
    remote: string;
};
export type HistoryStatus = {
    path: string;
    base: string | null;
    modified: boolean;
    conflict: HistoryConflict | null;
};
export type HistoryDiff = {
    from: string;
    to: string;
    before: string;
    after: string;
    token: string;
};
type Revision = HistoryEntry & {
    blob: string;
};
export type HistoryRefs = {
    base: string | null;
    draft: string | null;
    remote: string | null;
    conflict: HistoryConflict | null;
    strict: boolean;
    revisions: Revision[];
    resolution: FetchedDocument | null;
    resolutionParent: string | null;
};
export declare function working(path: string): Promise<string | null>;
export declare function withHistoryLock<T>(root: string, key: string, run: () => Promise<T>): Promise<T>;
export declare class DocumentHistory {
    private readonly now;
    readonly dir: string;
    refs: HistoryRefs;
    private constructor();
    static load(root: string, id: string, now: () => Date): Promise<DocumentHistory>;
    save(): Promise<void>;
    revision(kind: HistoryEntry["kind"], markdown: string, parents: (string | null)[]): Promise<string>;
    token(): string;
    text(ref: string): Promise<string>;
    seed(markdown: string | null): Promise<void>;
    captureLocal(markdown: string): Promise<string>;
    observe(remote: FetchedDocument): Promise<string>;
    status(path: string): Promise<HistoryStatus>;
    publish(path: string, expected: string | null, next: string, refs: HistoryRefs, resource: Resource | null, put: (r: Resource) => Promise<Resource>, acknowledged?: boolean): Promise<void>;
    recover(path: string | undefined, put: (r: Resource) => Promise<Resource>): Promise<void>;
    private finish;
}
export {};
//# sourceMappingURL=history.d.ts.map