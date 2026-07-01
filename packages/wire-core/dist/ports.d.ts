import type { Registry } from "./core/model.js";
export type WireBackend = "files" | "sqlite";
export type InitializedWire = Readonly<{
    root: string;
    backend: WireBackend;
    path: string;
    created: boolean;
}>;
export type WireWatchMode = "two-way" | "download";
export type WireWatchConfig = Readonly<{
    mode: WireWatchMode;
    debounceMs: number;
    pollMs: number;
}>;
export type WireConfig = Readonly<{
    backend: WireBackend;
    path: string;
    env?: Readonly<Record<string, string>>;
    watch?: Partial<WireWatchConfig>;
}>;
export type SwitchedWireBackend = Readonly<{
    root: string;
    from: WireBackend;
    to: WireBackend;
    fromPath: string;
    toPath: string;
    resources: number;
}>;
export type WatchHandle = Readonly<{
    close(): void;
}>;
export interface WatchCapability {
    watchFile(path: string, onChange: () => void | Promise<void>): WatchHandle;
    every(milliseconds: number, onTick: () => void | Promise<void>): WatchHandle;
}
export type WireWorkspace = Readonly<{
    configuredRoot(path: string, home: string): Promise<string | null>;
    initialize(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire>;
    loadConfig?(wireRoot: string): Promise<WireConfig>;
    openRegistry(path: string, home: string): Promise<Registry>;
    relativePath(path: string, root: string): string;
    switchBackend?(path: string, home: string): Promise<SwitchedWireBackend>;
}>;
export interface HttpCapability {
    request(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
export interface FilesystemCapability {
    exists(path: string): Promise<boolean>;
    readText(path: string): Promise<string>;
    writeText(path: string, contents: string): Promise<void>;
    delete(path: string): Promise<void>;
}
export interface ProcessResult {
    readonly stdout: string;
    readonly stderr: string;
}
export interface ProcessCapability {
    execute(command: string, args: readonly string[], environment?: Readonly<Record<string, string>>): Promise<ProcessResult>;
}
export interface ClockCapability {
    now(): Date;
    localTimezone(): string;
    timezone(name: string): Intl.DateTimeFormat;
}
export interface OpenFilesCapability {
    open(path: string): Promise<void>;
}
export interface ConfigurationCapability {
    get(name: string): string;
}
export interface SecretsCapability {
    get(reference: string): Promise<string>;
}
export interface Cookie {
    readonly domain: string;
    readonly includeSubdomains: boolean;
    readonly path: string;
    readonly secure: boolean;
    readonly expires: number;
    readonly name: string;
    readonly value: string;
    readonly httpOnly: boolean;
}
export interface CookiesCapability {
    load(service: string): Promise<readonly Cookie[]>;
    loadSaved(service: string): Promise<readonly Cookie[] | null>;
    metadata(service: string): Promise<Readonly<Record<string, string>>>;
    save(service: string, cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>): Promise<void>;
    delete(service: string): Promise<void>;
}
export interface GoogleTokenDocument {
    readonly token: string;
    readonly refresh_token: string;
    readonly token_uri: string;
    readonly client_id?: string;
    readonly client_secret?: string;
    readonly scopes?: readonly string[];
    readonly expiry?: string;
    readonly [key: string]: unknown;
}
export interface GoogleTokensCapability {
    load(): Promise<GoogleTokenDocument>;
    refresh(): Promise<GoogleTokenDocument>;
}
export interface RuntimeCapabilities {
    readonly http: HttpCapability;
    readonly filesystem: FilesystemCapability;
    readonly process: ProcessCapability;
    readonly clock: ClockCapability;
    readonly openFiles: OpenFilesCapability;
    readonly configuration: ConfigurationCapability;
    readonly secrets: SecretsCapability;
    readonly cookies: CookiesCapability;
    readonly gmailTokens: GoogleTokensCapability;
    readonly googleFormsTokens: GoogleTokensCapability;
}
//# sourceMappingURL=ports.d.ts.map