import { plainMarkdown } from "./editor-receipts.js";
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
export function synchronizeSource(input, value, catalog, base, markdown, markdownPath, observeRemote, requireConditionalWrite) {
    plainMarkdown(markdown);
    const url = new URL(value);
    const service = serviceForUrl(url, catalog);
    const source = service.parse(url);
    return service.synchronize === undefined ? service.fetch(input, value, source) : service.synchronize(input, value, source, base, markdown, markdownPath, observeRemote, requireConditionalWrite);
}
export function uploadSource(input, catalog, markdown, markdownPath) {
    plainMarkdown(markdown);
    const header = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1];
    if (header && /^google_doc:/m.test(header) && /^google_drive_folder:/m.test(header)) {
        throw new Error("This file is already bound to Google Drive. Use its existing sync owner.");
    }
    const service = catalog.find((item) => item.name === "notion" && item.upload !== undefined);
    if (service === undefined || service.upload === undefined)
        throw new Error("No Notion upload service configured");
    return service.upload(input, markdown, markdownPath);
}
/** Concurrent changes that the provider cannot combine without a user decision. */
export class WireMergeConflict extends Error {
}
//# sourceMappingURL=source.js.map