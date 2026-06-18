function serviceForUrl(url, catalog) {
    const service = catalog.find((item) => item.matches(url));
    if (service === undefined)
        throw new Error(`Unsupported source URL: ${url}`);
    return service;
}
export function defineService(service) {
    return Object.freeze(service);
}
export function defineServiceCatalog(services) {
    return Object.freeze([...services]);
}
export function createServiceRegistry() {
    const services = [];
    const registry = Object.freeze({
        use: (provider) => {
            services.push(...provider.services);
            return registry;
        },
        catalog: () => defineServiceCatalog(services),
    });
    return registry;
}
export function parseSourceUrl(value, catalog) {
    const url = new URL(value);
    return Object.freeze(serviceForUrl(url, catalog).parse(url));
}
export function fetchSource(input, value, catalog) {
    const url = new URL(value);
    const service = serviceForUrl(url, catalog);
    return service.fetch(input, value, service.parse(url));
}
export function synchronizeSource(input, value, catalog, base, markdown, markdownPath) {
    const url = new URL(value);
    const service = serviceForUrl(url, catalog);
    const source = service.parse(url);
    return service.synchronize === undefined ? service.fetch(input, value, source) : service.synchronize(input, value, source, base, markdown, markdownPath);
}
export function uploadSource(input, catalog, markdown, markdownPath) {
    const service = catalog.find((item) => item.name === "notion" && item.upload !== undefined);
    if (service === undefined || service.upload === undefined)
        throw new Error("No Notion upload service configured");
    return service.upload(input, markdown, markdownPath);
}
//# sourceMappingURL=source.js.map