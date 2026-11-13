import type { Identifier, Registry, Resource } from "../core/model.js";
export declare class SqliteRegistry implements Registry {
    readonly path: string;
    constructor(path: string, create?: boolean);
    put(resource: Resource): Promise<Resource>;
    rekey(previous: Resource, identifier: Identifier): Promise<Resource>;
    get(resourceId: string): Promise<Resource>;
    findByIdentifier(service: string, identifier: string): Promise<Resource>;
    findByUrl(url: string): Promise<Resource>;
    findByPath(path: string): Promise<readonly Resource[]>;
    listResources(): Promise<readonly Resource[]>;
    delete(resourceId: string): Promise<void>;
    private getResource;
    private connect;
}
export declare class FileRegistry implements Registry {
    readonly path: string;
    constructor(path: string, create?: boolean);
    put(resource: Resource): Promise<Resource>;
    rekey(previous: Resource, identifier: Identifier): Promise<Resource>;
    get(resourceId: string): Promise<Resource>;
    findByIdentifier(service: string, identifier: string): Promise<Resource>;
    findByUrl(url: string): Promise<Resource>;
    findByPath(path: string): Promise<readonly Resource[]>;
    listResources(): Promise<readonly Resource[]>;
    delete(resourceId: string): Promise<void>;
    private resourcePath;
}
//# sourceMappingURL=registry.d.ts.map