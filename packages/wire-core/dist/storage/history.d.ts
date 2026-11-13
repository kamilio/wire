import type { FetchedDocument, Resource } from "../core/model.js";
import { editorView, type EditorReceipts } from "./editor-receipts.js";
export type HistoryEntry = {
    id: string;
    parents: string[];
    kind: "attach" | "local" | "remote" | "merge" | "resolve" | "recovered";
    at: string;
};
export type HistoryConflict = {
    base: string;
    local: string;
    remote: string;
} | {
    editor: string;
    shell: string;
    editorBase: string;
    shellBase: string;
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
    editorReceipts?: EditorReceipts;
    retiredEditorReceipts?: EditorReceipts;
    editorDraft?: string;
    strict: boolean;
    revisions: Revision[];
    resolution: FetchedDocument | null;
    resolutionParent: string | null;
};
export declare function requireHistoryVolume(historyDirectory: string, markdownDirectory: string): Promise<void>;
export declare function working(path: string): Promise<string | null>;
export declare function withHistoryLock<T>(root: string, key: string, run: () => Promise<T>): Promise<T>;
export declare function withBackendSwitch<T>(root: string, run: () => Promise<T>): Promise<T>;
export declare class DocumentHistory {
    private readonly id;
    private readonly now;
    readonly dir: string;
    refs: HistoryRefs;
    private constructor();
    static load(root: string, id: string, now: () => Date): Promise<DocumentHistory>;
    save(): Promise<void>;
    revision(kind: HistoryEntry["kind"], markdown: string, parents: (string | null)[]): Promise<string>;
    token(raw?: string | null): string;
    view(raw: string): {
        markdown: string;
        shown: null;
        base: null;
    } | {
        markdown: string;
        shown: string;
        base: string;
    };
    text(ref: string): Promise<string>;
    log(): Promise<HistoryEntry[]>;
    seed(markdown: string | null): Promise<void>;
    checkPendingDraft(view: ReturnType<typeof editorView>): Promise<void>;
    captureLocal(markdown: string, parent?: string | null): Promise<string>;
    observe(remote: FetchedDocument): Promise<string>;
    status(path: string): Promise<HistoryStatus>;
    publish(path: string, expected: string | null, next: string, refs: HistoryRefs, resource: Resource | null, put: (r: Resource) => Promise<Resource>, acknowledged?: boolean): Promise<void>;
    detach(path: string, expected: string | null, next: string, refs: HistoryRefs, detached: Resource, remove: (r: Resource) => Promise<void>): Promise<void>;
    recover(path: string | undefined, put: (r: Resource) => Promise<Resource>, remove?: (r: Resource) => Promise<void>): Promise<Readonly<{
        id: string;
        type: import("../core/model.js").ResourceType;
        identifiers: readonly import("../core/model.js").Identifier[];
        urls: readonly string[];
        filesystem_links: readonly import("../core/model.js").FilesystemLink[];
        data: readonly import("../core/model.js").ResourceData[];
        relationships: readonly import("../core/model.js").Relationship[];
    }> | undefined>;
    private finish;
}
export {};
//# sourceMappingURL=history.d.ts.map