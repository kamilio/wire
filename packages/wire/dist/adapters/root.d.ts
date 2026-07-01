import { type Group } from "toolcraft";
import { type FetchedDocument, type InitializedWire, type Resource, type SwitchedWireBackend, type Wire, type WireResult, type WireWatchSession } from "wire-core";
import type { Auth, AuthResult, AuthService } from "../auth.js";
export type WireRoot = Group;
export type TextInputReader = () => Promise<string>;
export type WireRootOptions = Readonly<{
    allowPaste: boolean;
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
export declare function createRoot(wire: Wire, currentDirectory: string, auth?: Auth, readInput?: TextInputReader, options?: WireRootOptions): WireRoot;
export {};
//# sourceMappingURL=root.d.ts.map