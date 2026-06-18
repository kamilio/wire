import type { FetchedDocument, Resource, ServiceCatalog } from "./core/model.js";
import type { InitializedWire, SwitchedWireBackend, WatchCapability, WireBackend, WireWatchConfig, WireWorkspace } from "./ports.js";
export type { WireWorkspace } from "./ports.js";
export type WireFilesystem = Readonly<{
    exists(path: string): Promise<boolean>;
    isFile(path: string): Promise<boolean>;
    readText(path: string): Promise<string>;
    writeText(path: string, contents: string): Promise<void>;
}>;
export type WireDependencies<FetchInput> = Readonly<{
    home: string;
    fetchInput: FetchInput;
    catalog: ServiceCatalog<FetchInput>;
    filesystem: WireFilesystem;
    workspace: WireWorkspace;
    initialization: Readonly<{
        backend: WireBackend;
        registryPath: string;
    }>;
    watch?: WatchCapability;
    now(): Date;
    open(path: string): Promise<void>;
}>;
export type WireAction = "created" | "downloaded" | "uploaded" | "synced" | "unlinked" | "failed";
export type WireResult = Readonly<{
    resource: Resource;
    path: string;
    markdown: string;
    summary: Readonly<{
        action: WireAction;
        added: number;
        removed: number;
        modified: number;
        remote: string;
        local: string;
        error?: string;
    }>;
}>;
export type WireWatchSession = Readonly<{
    resource: Resource;
    path: string;
    mode: WireWatchConfig["mode"];
    debounceMs: number;
    pollMs: number;
    closed: Promise<void>;
    close(): void;
}>;
export type Wire = Readonly<{
    create(url: string, path: string): Promise<WireResult>;
    view(url: string): Promise<FetchedDocument>;
    sync(value: string, path: string): Promise<WireResult>;
    download(value: string, path: string): Promise<WireResult>;
    unlink(value: string, path: string): Promise<WireResult>;
    watch(value: string, path: string): Promise<WireWatchSession>;
    openResource(value: string, path: string): Promise<Resource>;
    syncAll(path: string): Promise<readonly WireResult[]>;
    listResources(path: string): Promise<readonly Resource[]>;
    showResource(value: string, path: string): Promise<Resource>;
    init(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire>;
    switchBackend(path: string): Promise<SwitchedWireBackend>;
}>;
export declare function composeWire<FetchInput>(dependencies: WireDependencies<FetchInput>): Wire;
//# sourceMappingURL=operations.d.ts.map