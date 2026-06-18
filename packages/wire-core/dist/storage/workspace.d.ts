import type { Registry } from "../core/model.js";
import type { InitializedWire, SwitchedWireBackend, WireBackend, WireConfig } from "../ports.js";
export type { InitializedWire, WireBackend, WireConfig } from "../ports.js";
export declare function discoverWireRoot(path: string, home: string): Promise<string>;
export declare function configuredWireRoot(path: string, home: string): Promise<string | null>;
export declare function wireRelativePath(path: string, wireRoot: string): string;
export declare function loadWireConfig(wireRoot: string): Promise<WireConfig>;
export declare function openWireRegistry(path: string, home: string): Promise<Registry>;
export declare function initializeWire(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire>;
export declare function switchWireBackend(path: string, home: string): Promise<SwitchedWireBackend>;
//# sourceMappingURL=workspace.d.ts.map