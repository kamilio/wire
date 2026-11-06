import { type Group } from "toolcraft";
import { type JsonObject, type FetchedDocument, type InitializedWire, type Resource, type SwitchedWireBackend, type Wire, type WireResult, type WireWatchSession } from "wire-core";
import type { listAsanaProjects, listAsanaTasks, moveAsanaTask, showAsanaProject } from "provider-asana";
import type { zoomProvider } from "provider-zoom";
import type { SlackSentMessage } from "provider-slack";
import type { Auth, AuthResult, AuthService } from "../auth.js";
export type WireRoot = Group;
export type TextInputReader = () => Promise<string>;
export type WireRootOptions = Readonly<{
    allowPaste: boolean;
    scrapeZoom?: () => ReturnType<typeof zoomProvider.scrape>;
}>;
type WireRenderer<T> = Readonly<{
    json(value: T): unknown;
    markdown(value: T): string;
    rich(value: T, primitives: any): void;
}>;
type WirePresentation = Readonly<{
    init: WireRenderer<InitializedWire>;
    switchBackend: WireRenderer<SwitchedWireBackend>;
    attach: WireRenderer<WireResult>;
    view: WireRenderer<FetchedDocument>;
    sync: WireRenderer<WireResult>;
    download: WireRenderer<WireResult>;
    detach: WireRenderer<WireResult>;
    watch: WireRenderer<WireWatchSession>;
    open: WireRenderer<Resource>;
    syncAll: WireRenderer<readonly WireResult[]>;
    authStatus: WireRenderer<AuthResult>;
    authLogout: WireRenderer<{
        readonly service: AuthService;
        readonly deleted: true;
    }>;
}>;
export declare const wirePresentation: WirePresentation;
type AsanaExplorer = {
    lookup?(query: string): Promise<readonly JsonObject[]>;
    projects(): ReturnType<typeof listAsanaProjects>;
    project(project: string): ReturnType<typeof showAsanaProject>;
    tasks(project: string): ReturnType<typeof listAsanaTasks>;
    show(task: string): Promise<FetchedDocument>;
    writes?: {
        create?(project: string, title: string, section: string, body?: string, assignee?: string): Promise<JsonObject>;
        move(task: string, project: string, section: string): ReturnType<typeof moveAsanaTask>;
        edit(task: string, fields: JsonObject): Promise<JsonObject>;
        comment(task: string, body: string): Promise<JsonObject>;
        editComment(comment: string, body: string): Promise<JsonObject>;
    };
};
export declare function createRoot(wire: Wire, currentDirectory: string, auth?: Auth, readInput?: TextInputReader, options?: WireRootOptions, sendSlack?: (destination: string, markdown: string) => Promise<SlackSentMessage>, lookupSlack?: (query: string) => Promise<readonly JsonObject[]>, editSlack?: (url: string, markdown: string) => Promise<SlackSentMessage>, lookupNotion?: (query: string) => Promise<readonly JsonObject[]>, asana?: AsanaExplorer): WireRoot;
export {};
//# sourceMappingURL=root.d.ts.map