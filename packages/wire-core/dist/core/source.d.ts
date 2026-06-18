import type { FetchedDocument, Service, ServiceCatalog, Source, UploadedDocument } from "./model.js";
export type ServiceProvider<FetchInput> = Readonly<{
    services: readonly Service<FetchInput>[];
}>;
export type ServiceRegistry<FetchInput> = Readonly<{
    use(provider: ServiceProvider<FetchInput>): ServiceRegistry<FetchInput>;
    catalog(): ServiceCatalog<FetchInput>;
}>;
export declare function defineService<FetchInput>(service: Service<FetchInput>): Service<FetchInput>;
export declare function defineServiceCatalog<FetchInput>(services: readonly Service<FetchInput>[]): ServiceCatalog<FetchInput>;
export declare function createServiceRegistry<FetchInput>(): ServiceRegistry<FetchInput>;
export declare function parseSourceUrl<FetchInput>(value: string, catalog: ServiceCatalog<FetchInput>): Source;
export declare function fetchSource<FetchInput>(input: FetchInput, value: string, catalog: ServiceCatalog<FetchInput>): Promise<FetchedDocument>;
export declare function synchronizeSource<FetchInput>(input: FetchInput, value: string, catalog: ServiceCatalog<FetchInput>, base: import("./model.js").JsonValue, markdown: string, markdownPath: string): Promise<FetchedDocument>;
export declare function uploadSource<FetchInput>(input: FetchInput, catalog: ServiceCatalog<FetchInput>, markdown: string, markdownPath: string): Promise<UploadedDocument>;
//# sourceMappingURL=source.d.ts.map