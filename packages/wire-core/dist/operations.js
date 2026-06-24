import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { extractRelationships, markdownFilename } from "./core/transform.js";
import { resourceId } from "./core/resource.js";
import { fetchSource, parseSourceUrl, synchronizeSource, uploadSource } from "./core/source.js";
async function wireRoot(dependencies, path) {
    const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
    if (configured !== null)
        return configured;
    return (await dependencies.workspace.initialize(path, dependencies.initialization.backend, dependencies.initialization.registryPath)).root;
}
async function existingWireRoot(dependencies, path) {
    const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
    if (configured !== null)
        return configured;
    throw new Error("Wire workspace not initialized. Run `wire init` or `wire <url>` first.");
}
function watchConfig(config) {
    return {
        mode: config.watch?.mode ?? "two-way",
        debounceMs: config.watch?.debounceMs ?? 1000,
        pollMs: config.watch?.pollMs ?? 60000,
    };
}
function primaryLink(resource) {
    return resource.filesystem_links.find((link) => link.role === "primary");
}
function collisionFilename(title, service, identifier) {
    const base = markdownFilename(title).slice(0, -3);
    const suffix = `${service}-${identifier}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
    const compact = suffix.length <= 48 ? suffix : `${suffix.slice(0, 32).replace(/[-_.]+$/g, "")}-${createHash("sha256").update(suffix).digest("hex").slice(0, 10)}`;
    return `${base}-${compact}.md`;
}
function markdownLines(markdown) {
    return markdown === "" ? [] : markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
}
function changeSummary(before, after) {
    const beforeLines = markdownLines(before);
    const afterLines = markdownLines(after);
    let start = 0;
    while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start])
        start += 1;
    let beforeEnd = beforeLines.length;
    let afterEnd = afterLines.length;
    while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
        beforeEnd -= 1;
        afterEnd -= 1;
    }
    const removed = beforeEnd - start;
    const added = afterEnd - start;
    const modified = Math.min(removed, added);
    return { added: added - modified, removed: removed - modified, modified };
}
async function existingResource(registry, service, identifier) {
    const resources = await registry.listResources();
    return resources.find((resource) => resource.identifiers.some((item) => item.service === service && item.identifier === identifier)) ?? null;
}
function jsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function syncBase(service, snapshot, data) {
    if (service !== "notion")
        return snapshot;
    const sync = data.find((item) => item.namespace === "notion" && item.key === "sync")?.value;
    if (sync === undefined || !jsonObject(snapshot) || !jsonObject(sync) || sync["user_mentions"] === undefined)
        return snapshot;
    return { ...snapshot, user_mentions: sync["user_mentions"] };
}
function markdownSnapshot(snapshot) {
    if (!jsonObject(snapshot))
        return null;
    const markdown = snapshot["markdown"];
    return typeof markdown === "string" ? markdown : null;
}
function pathLikeResourceValue(value) {
    return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.includes("/") || value.includes("\\") || value.endsWith(".md");
}
function relativePathContains(parent, child) {
    return parent === "" || child === parent || child.startsWith(`${parent}/`);
}
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "object" && error !== null && "message" in error && typeof error["message"] === "string")
        return error["message"];
    if (typeof error === "object" && error !== null)
        return JSON.stringify(error);
    return String(error);
}
export function composeWire(dependencies) {
    const store = async (url, path, fetched, previousMarkdown, action, fixedOutputPath, summaryMarkdown, summaryAfterMarkdown) => {
        const source = parseSourceUrl(url, dependencies.catalog);
        const root = await wireRoot(dependencies, path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const current = await existingResource(registry, source.service, source.identifier);
        let outputPath;
        if (current !== null)
            outputPath = join(dirname(root), primaryLink(current).path);
        else if (fixedOutputPath !== undefined)
            outputPath = fixedOutputPath;
        else {
            const cleanPath = join(resolve(path), markdownFilename(fetched.title));
            outputPath = await dependencies.filesystem.exists(cleanPath) ? join(resolve(path), collisionFilename(fetched.title, source.service, source.identifier)) : cleanPath;
        }
        const relativePath = dependencies.workspace.relativePath(outputPath, root);
        const previous = previousMarkdown === null ? await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "" : previousMarkdown;
        await dependencies.filesystem.writeText(outputPath, fetched.markdown);
        const id = resourceId(source);
        const primary = current?.filesystem_links.find((link) => link.path === relativePath && link.role === "primary");
        const resource = {
            id,
            type: source.type,
            identifiers: [{ service: source.service, identifier: source.identifier }],
            urls: [url],
            filesystem_links: current === null
                ? [{ path: relativePath, role: "primary", data: { format: "markdown" } }]
                : [
                    ...current.filesystem_links.filter((link) => !(link.path === relativePath && link.role === "primary")),
                    primary ?? { path: relativePath, role: "primary", data: { format: "markdown" } },
                ],
            data: [
                ...(current?.data.filter((item) => item.namespace !== "wire" && !(item.namespace === source.service && item.key === "snapshot")) ?? []),
                { namespace: "wire", key: "title", value: fetched.title },
                { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
                { namespace: source.service, key: "snapshot", value: fetched.data },
            ],
            relationships: extractRelationships(fetched.markdown, id, dependencies.catalog),
        };
        const stored = await registry.put(resource);
        const changes = changeSummary(summaryMarkdown ?? previous, summaryAfterMarkdown);
        const resolvedAction = action === "attached" && current !== null && previous !== "" ? changes.added === 0 && changes.modified === 0 && changes.removed === 0 ? "synced" : "downloaded" : action;
        return { resource: stored, path: outputPath, markdown: fetched.markdown, summary: { action: resolvedAction, ...changes, remote: url, local: outputPath } };
    };
    const attach = async (url, path) => {
        const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
        return store(url, path, fetched, null, "attached", undefined, undefined, fetched.markdown);
    };
    const create = attach;
    const view = (url) => fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    const downloadSource = async (url, path) => {
        const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
        const source = parseSourceUrl(url, dependencies.catalog);
        const cleanPath = join(resolve(path), markdownFilename(fetched.title));
        const outputPath = await dependencies.filesystem.exists(cleanPath) ? join(resolve(path), collisionFilename(fetched.title, source.service, source.identifier)) : cleanPath;
        const previous = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
        await dependencies.filesystem.writeText(outputPath, fetched.markdown);
        const id = resourceId(source);
        const resource = {
            id,
            type: source.type,
            identifiers: [{ service: source.service, identifier: source.identifier }],
            urls: [url],
            filesystem_links: [{ path: basename(outputPath), role: "primary", data: { format: "markdown" } }],
            data: [
                { namespace: "wire", key: "title", value: fetched.title },
                { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
                { namespace: source.service, key: "snapshot", value: fetched.data },
            ],
            relationships: extractRelationships(fetched.markdown, id, dependencies.catalog),
        };
        return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: "downloaded", ...changeSummary(previous, fetched.markdown), remote: url, local: outputPath } };
    };
    const resolveResource = async (registry, value, root, path) => {
        if (value.startsWith("http://") || value.startsWith("https://")) {
            const source = parseSourceUrl(value, dependencies.catalog);
            const resources = await registry.listResources();
            const resource = resources.find((item) => item.identifiers.some((identifier) => identifier.service === source.service && identifier.identifier === source.identifier));
            if (resource === undefined)
                throw new Error(`Resource URL not found: ${value}`);
            return resource;
        }
        const candidatePath = resolve(path, value);
        const relativePath = dependencies.workspace.relativePath(candidatePath, root);
        const resources = await registry.findByPath(relativePath);
        if (resources.length > 0 || await dependencies.filesystem.exists(candidatePath)) {
            if (resources.length === 0)
                throw new Error(`Resource path is not registered: ${value}`);
            if (resources.length > 1)
                throw new Error(`Ambiguous resource path ${relativePath}: ${resources.map((resource) => resource.id).join(", ")}. Use a resource id or URL.`);
            return resources[0];
        }
        if (pathLikeResourceValue(value))
            throw new Error(`Resource path not found: ${value}`);
        return registry.get(value);
    };
    const sync = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const relativePath = dependencies.workspace.relativePath(candidatePath, root);
        const pathResources = await registry.findByPath(relativePath);
        if (pathResources.length === 0 && await dependencies.filesystem.exists(candidatePath)) {
            const markdown = await dependencies.filesystem.readText(candidatePath);
            const uploaded = await uploadSource(dependencies.fetchInput, dependencies.catalog, markdown, candidatePath);
            return store(uploaded.url, dirname(candidatePath), uploaded, markdown, "uploaded", candidatePath, undefined, uploaded.markdown);
        }
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const outputDirectory = dirname(outputPath);
        const source = parseSourceUrl(resource.urls[0], dependencies.catalog);
        const snapshot = resource.data.find((item) => item.namespace === source.service && item.key === "snapshot").value;
        const markdown = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
        const base = syncBase(source.service, snapshot, resource.data);
        const baseMarkdown = markdownSnapshot(base);
        const localChanged = baseMarkdown !== null && markdown !== baseMarkdown;
        const fetched = await synchronizeSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog, base, markdown, outputPath);
        const action = localChanged ? fetched.markdown === baseMarkdown ? "synced" : "uploaded" : fetched.markdown === markdown ? "synced" : "downloaded";
        return store(resource.urls[0], outputDirectory, fetched, markdown, action, undefined, action === "uploaded" && baseMarkdown !== null ? baseMarkdown : undefined, action === "uploaded" ? markdown : fetched.markdown);
    };
    const download = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const markdown = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
        const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
        return store(resource.urls[0], dirname(outputPath), fetched, markdown, "downloaded", undefined, undefined, fetched.markdown);
    };
    const detach = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const result = await download(value, path);
        await registry.delete(resource.id);
        return { ...result, summary: { ...result.summary, action: "detached" } };
    };
    const unlink = detach;
    const watch = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const config = watchConfig(await dependencies.workspace.loadConfig(root));
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        const outputPath = join(dirname(root), primaryLink(resource).path);
        const initial = await dependencies.filesystem.exists(outputPath) ? null : await download(value, path);
        let lastSyncedMarkdown = initial === null ? await dependencies.filesystem.readText(outputPath) : initial.markdown;
        let debounce;
        let resolveClosed;
        const closed = new Promise((resolveClosedPromise) => { resolveClosed = resolveClosedPromise; });
        const handles = [];
        const synchronize = async () => {
            const result = config.mode === "download" ? await download(value, path) : await sync(value, path);
            lastSyncedMarkdown = result.markdown;
        };
        const schedule = () => {
            if (debounce !== undefined)
                clearTimeout(debounce);
            debounce = setTimeout(() => {
                debounce = undefined;
                void synchronize();
            }, config.debounceMs);
        };
        handles.push(dependencies.watch.every(config.pollMs, synchronize));
        if (config.mode === "two-way") {
            handles.push(dependencies.watch.watchFile(outputPath, async () => {
                if (await dependencies.filesystem.readText(outputPath) !== lastSyncedMarkdown)
                    schedule();
            }));
        }
        return Object.freeze({
            resource,
            path: outputPath,
            mode: config.mode,
            debounceMs: config.debounceMs,
            pollMs: config.pollMs,
            closed,
            close: () => {
                if (debounce !== undefined)
                    clearTimeout(debounce);
                for (const handle of handles)
                    handle.close();
                resolveClosed();
            },
        });
    };
    const openResource = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const resource = await resolveResource(registry, value, root, path);
        await dependencies.open(resource.urls[0]);
        return resource;
    };
    const syncAll = async (path) => {
        const root = await existingWireRoot(dependencies, path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        const scope = dependencies.workspace.relativePath(path, root);
        const results = [];
        for (const resource of await registry.listResources()) {
            const outputPath = join(dirname(root), primaryLink(resource).path);
            if (relativePathContains(scope, primaryLink(resource).path)) {
                try {
                    results.push(await sync(resource.id, dirname(outputPath)));
                }
                catch (error) {
                    results.push({ resource, path: outputPath, markdown: "", summary: { action: "failed", added: 0, modified: 0, removed: 0, remote: resource.urls[0], local: outputPath, error: errorMessage(error) } });
                }
            }
        }
        return results;
    };
    const listResources = async (path) => {
        const root = await existingWireRoot(dependencies, path);
        return (await dependencies.workspace.openRegistry(root, dependencies.home)).listResources();
    };
    const showResource = async (value, path) => {
        const candidatePath = resolve(path, value);
        const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
        const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
        return resolveResource(registry, value, root, path);
    };
    return Object.freeze({
        attach,
        create,
        view,
        downloadSource,
        sync,
        download,
        detach,
        unlink,
        watch,
        openResource,
        syncAll,
        listResources,
        showResource,
        init: dependencies.workspace.initialize,
        switchBackend: (path) => dependencies.workspace.switchBackend(path, dependencies.home),
    });
}
//# sourceMappingURL=operations.js.map