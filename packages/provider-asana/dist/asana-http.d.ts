import type { JsonObject, RuntimeCapabilities } from "wire-core";
export declare function asanaHttp(runtime: RuntimeCapabilities, url: URL, init: RequestInit): Promise<Response>;
export declare function request(runtime: RuntimeCapabilities, method: string, path: string, parameters?: Readonly<Record<string, string>>, data?: JsonObject): Promise<JsonObject>;
export declare function paginate(runtime: RuntimeCapabilities, path: string, parameters: Readonly<Record<string, string>>): Promise<readonly JsonObject[]>;
//# sourceMappingURL=asana-http.d.ts.map