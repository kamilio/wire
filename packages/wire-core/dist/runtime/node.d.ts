import type { ClockCapability, ConfigurationCapability, FilesystemCapability, HttpCapability, OpenFilesCapability, ProcessCapability, RuntimeCapabilities, SecretsCapability, WatchCapability } from "../ports.js";
export type NodeEnvironment = Readonly<Record<string, string | undefined>>;
export declare function createNodeHttp(): HttpCapability;
export declare function createNodeFilesystem(): FilesystemCapability;
export declare function createNodeProcess(): ProcessCapability;
export declare function createNodeClock(): ClockCapability;
export declare function createNodeOpenFiles(processCapability: ProcessCapability): OpenFilesCapability;
export declare function createNodeWatch(): WatchCapability;
export declare function createNodeConfiguration(environment: NodeEnvironment): ConfigurationCapability;
export declare function createNodeSecrets(filesystem: FilesystemCapability, environment: NodeEnvironment): SecretsCapability;
export interface NodeRuntimeDependencies {
    readonly environment: NodeEnvironment;
    readonly http: HttpCapability;
    readonly filesystem: FilesystemCapability;
    readonly process: ProcessCapability;
    readonly clock: ClockCapability;
}
export declare function composeNodeRuntime(dependencies: NodeRuntimeDependencies): RuntimeCapabilities;
export declare function createNodeRuntime(environment: NodeEnvironment): RuntimeCapabilities;
//# sourceMappingURL=node.d.ts.map