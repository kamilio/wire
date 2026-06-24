import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { stableJsonPretty } from "../core/json.js";
import { FileRegistry, SqliteRegistry } from "./registry.js";
function canonicalPath(path) {
    const resolved = resolve(path);
    if (existsSync(resolved))
        return realpathSync(resolved);
    return join(canonicalPath(dirname(resolved)), basename(resolved));
}
export async function discoverWireRoot(path, home) {
    const homePath = canonicalPath(home);
    let currentPath = canonicalPath(path);
    if (!existsSync(currentPath) || !statSync(currentPath).isDirectory())
        currentPath = dirname(currentPath);
    while (true) {
        const wirePath = join(currentPath, ".wire");
        if (existsSync(wirePath) && statSync(wirePath).isDirectory())
            return wirePath;
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath)
            return join(homePath, ".wire");
        currentPath = parentPath;
    }
}
export async function configuredWireRoot(path, home) {
    const wireRoot = await discoverWireRoot(path, home);
    const configPath = join(wireRoot, "config.json");
    return existsSync(configPath) && statSync(configPath).isFile() ? wireRoot : null;
}
export function wireRelativePath(path, wireRoot) {
    return relative(dirname(canonicalPath(wireRoot)), canonicalPath(path)).replaceAll(sep, "/");
}
export async function loadWireConfig(wireRoot) {
    return JSON.parse(await readFile(join(wireRoot, "config.json"), "utf8"));
}
export async function openWireRegistry(path, home) {
    const wireRoot = await discoverWireRoot(path, home);
    const config = await loadWireConfig(wireRoot);
    const registryPath = join(wireRoot, config.path);
    if (config.backend === "sqlite")
        return new SqliteRegistry(registryPath);
    if (config.backend === "files")
        return new FileRegistry(registryPath);
    throw new Error(config.backend);
}
export async function initializeWire(path, backend, registryPath) {
    const wireRoot = join(canonicalPath(path), ".wire");
    await mkdir(wireRoot, { recursive: true });
    const configPath = join(wireRoot, "config.json");
    if (existsSync(configPath) && statSync(configPath).isFile()) {
        const existing = await loadWireConfig(wireRoot);
        if (existing.backend !== backend || existing.path !== registryPath)
            throw new Error(`Wire workspace already initialized with ${existing.backend} registry at ${existing.path}. Existing registries are not overwritten.`);
        return { root: wireRoot, backend: existing.backend, path: join(wireRoot, existing.path), created: false };
    }
    const config = { backend, path: registryPath };
    await writeFile(configPath, `${stableJsonPretty(config)}\n`, "utf8");
    const fullRegistryPath = join(wireRoot, registryPath);
    if (backend === "sqlite")
        new SqliteRegistry(fullRegistryPath);
    else if (backend === "files")
        new FileRegistry(fullRegistryPath);
    else
        throw new Error(backend);
    return { root: wireRoot, backend, path: fullRegistryPath, created: true };
}
export async function switchWireBackend(path, home) {
    const wireRoot = await discoverWireRoot(path, home);
    const config = await loadWireConfig(wireRoot);
    const fromPath = join(wireRoot, config.path);
    const source = config.backend === "sqlite" ? new SqliteRegistry(fromPath) : new FileRegistry(fromPath);
    const resources = await source.listResources();
    const to = config.backend === "sqlite" ? "files" : "sqlite";
    const targetRelativePath = to === "sqlite" ? "registry.sqlite3" : "records";
    const toPath = join(wireRoot, targetRelativePath);
    await rm(toPath, { recursive: true, force: true });
    const target = to === "sqlite" ? new SqliteRegistry(toPath) : new FileRegistry(toPath);
    for (const resource of resources)
        await target.put(resource);
    await writeFile(join(wireRoot, "config.json"), `${stableJsonPretty({ ...config, backend: to, path: targetRelativePath })}\n`, "utf8");
    await rm(fromPath, { recursive: true, force: true });
    return { root: wireRoot, from: config.backend, to, fromPath, toPath, resources: resources.length };
}
//# sourceMappingURL=workspace.js.map