import type { FetchedDocument, Service, ServiceCatalog, Source, UploadedDocument } from "./model.js";

export type ServiceProvider<FetchInput> = Readonly<{
  services: readonly Service<FetchInput>[];
}>;

export type ServiceRegistry<FetchInput> = Readonly<{
  use(provider: ServiceProvider<FetchInput>): ServiceRegistry<FetchInput>;
  catalog(): ServiceCatalog<FetchInput>;
}>;

function serviceForUrl<FetchInput>(url: URL, catalog: ServiceCatalog<FetchInput>): Service<FetchInput> {
  const service = catalog.find((item) => item.matches(url));
  if (service === undefined) throw new Error(`Unsupported source URL: ${url}`);
  return service;
}

export function defineService<FetchInput>(service: Service<FetchInput>): Service<FetchInput> {
  return Object.freeze(service);
}

export function defineServiceCatalog<FetchInput>(services: readonly Service<FetchInput>[]): ServiceCatalog<FetchInput> {
  return Object.freeze([...services]);
}

export function createServiceRegistry<FetchInput>(): ServiceRegistry<FetchInput> {
  const services: Service<FetchInput>[] = [];
  const registry: ServiceRegistry<FetchInput> = Object.freeze({
    use: (provider: ServiceProvider<FetchInput>) => {
      services.push(...provider.services);
      return registry;
    },
    catalog: () => defineServiceCatalog(services),
  });
  return registry;
}

export function parseSourceUrl<FetchInput>(value: string, catalog: ServiceCatalog<FetchInput>): Source {
  const url = new URL(value);
  return Object.freeze(serviceForUrl(url, catalog).parse(url));
}

export function fetchSource<FetchInput>(
  input: FetchInput,
  value: string,
  catalog: ServiceCatalog<FetchInput>,
): Promise<FetchedDocument> {
  const url = new URL(value);
  const service = serviceForUrl(url, catalog);
  return service.fetch(input, value, service.parse(url));
}

export function synchronizeSource<FetchInput>(
  input: FetchInput,
  value: string,
  catalog: ServiceCatalog<FetchInput>,
  base: import("./model.js").JsonValue,
  markdown: string,
  markdownPath: string,
): Promise<FetchedDocument> {
  const url = new URL(value);
  const service = serviceForUrl(url, catalog);
  const source = service.parse(url);
  return service.synchronize === undefined ? service.fetch(input, value, source) : service.synchronize(input, value, source, base, markdown, markdownPath);
}

export function uploadSource<FetchInput>(
  input: FetchInput,
  catalog: ServiceCatalog<FetchInput>,
  markdown: string,
  markdownPath: string,
): Promise<UploadedDocument> {
  const service = catalog.find((item) => item.name === "notion" && item.upload !== undefined);
  if (service === undefined || service.upload === undefined) throw new Error("No Notion upload service configured");
  return service.upload(input, markdown, markdownPath);
}
