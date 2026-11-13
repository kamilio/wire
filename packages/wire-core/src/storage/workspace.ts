import { existsSync, realpathSync, statSync } from "node:fs";
import { link, lstat, mkdir, open, readFile, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { randomUUID } from "node:crypto";
import { withBackendSwitch } from "./history.js";
import { stableJsonPretty } from "../core/json.js";
import type { Registry } from "../core/model.js";
import type { InitializedWire, SwitchedWireBackend, WireBackend, WireConfig } from "../ports.js";
import { FileRegistry, SqliteRegistry } from "./registry.js";

export type { InitializedWire, WireBackend, WireConfig } from "../ports.js";

export const defaultWireBackend = "files" satisfies WireBackend;
export const defaultWireRegistryPath = "records";

export function registryPathForBackend(backend: WireBackend): string {
  if (backend === "files") return "records";
  if (backend === "sqlite") return "registry.sqlite3";
  throw new Error(backend);
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) return realpathSync(resolved);
  return join(canonicalPath(dirname(resolved)), basename(resolved));
}

function protectHistory(root: string, path: string) {
  const history = canonicalPath(join(root, "history")), registry = canonicalPath(path);
  if (registry === history || registry.startsWith(history + sep) || history.startsWith(registry + sep)) throw new Error("The Wire registry must not overlap private document history.");
}

export async function discoverWireRoot(path: string, home: string): Promise<string> {
  const homePath = canonicalPath(home);
  let currentPath = canonicalPath(path);
  if (!existsSync(currentPath) || !statSync(currentPath).isDirectory()) currentPath = dirname(currentPath);
  while (true) {
    const wirePath = join(currentPath, ".wire");
    if (existsSync(wirePath) && statSync(wirePath).isDirectory()) return wirePath;
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) return join(homePath, ".wire");
    currentPath = parentPath;
  }
}

export async function configuredWireRoot(path: string, home: string): Promise<string | null> {
  const wireRoot = await discoverWireRoot(path, home);
  const configPath = join(wireRoot, "config.json");
  return existsSync(configPath) && statSync(configPath).isFile() ? wireRoot : null;
}

export function wireRelativePath(path: string, wireRoot: string): string {
  return relative(dirname(canonicalPath(wireRoot)), canonicalPath(path)).replaceAll(sep, "/");
}

export async function loadWireConfig(wireRoot: string): Promise<WireConfig> {
  return JSON.parse(await readFile(join(wireRoot, "config.json"), "utf8")) as WireConfig;
}

export async function openWireRegistry(path: string, home: string): Promise<Registry> {
  const wireRoot = await discoverWireRoot(path, home);
  const config = await loadWireConfig(wireRoot);
  const registryPath = join(wireRoot, config.path);
  protectHistory(wireRoot, registryPath);
  try {
    if (config.backend === "sqlite") return new SqliteRegistry(registryPath, false);
    if (config.backend === "files") return new FileRegistry(registryPath, false);
    throw new Error(config.backend);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    throw new Error("Configured Wire registry is missing. Restore its storage, or run wire init with the matching backend if this workspace has never stored documents.");
  }
}

export async function initializeWire(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire> {
  const wireRoot = join(canonicalPath(path), ".wire");
  await mkdir(wireRoot, { recursive: true });
  protectHistory(wireRoot, join(wireRoot, registryPath));
  const fullRegistryPath = join(wireRoot, registryPath);
  const config = { backend, path: registryPath } satisfies WireConfig;
  const hasConfig = async () => {
    const existing = await loadWireConfig(wireRoot).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
    if (existing && (existing.backend !== backend || existing.path !== registryPath)) throw new Error(`Wire workspace already initialized with ${existing.backend} registry at ${existing.path}. Existing registries are not overwritten.`);
    return !!existing;
  };
  const occupied = async (path: string) => lstat(path).then(() => true, (e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; return false; });
  const result = (created: boolean) => ({root: wireRoot, backend, path: fullRegistryPath, created});
  if (await hasConfig() && await occupied(fullRegistryPath)) return result(false);

  const kept = "Configured Wire registry is missing but prior workspace storage exists. Restore the registry; wire init will not replace it.";
  const history = join(wireRoot, "history");
  for (let attempt = 0;; attempt++) {
    try {
      return await withBackendSwitch(wireRoot, async () => {
        const configured = await hasConfig(), storeExists = await occupied(fullRegistryPath);
        if (configured && storeExists) return result(false);
        if (!storeExists) {
          const priorFiles = await readdir(wireRoot);
          const firstNames = new Set(["config.json", "auth", "hooks", "history", registryPath.split(sep)[0]!]);
          if (priorFiles.some(name => !firstNames.has(name) && !/^\.wire-init-[a-f0-9-]{36}$/.test(name)) ||
              (await readdir(history)).some(name => !/^switch(?:\.\d+)?$/.test(name))) throw new Error(kept);
          if (backend === "sqlite") for (const suffix of ["-journal","-wal","-shm"]) if (await occupied(fullRegistryPath + suffix)) throw new Error(kept);
          await mkdir(dirname(fullRegistryPath), {recursive: true});
          if (backend === "files") await mkdir(fullRegistryPath, {mode:0o700});
          else if (backend === "sqlite") {
            const staged = join(dirname(fullRegistryPath), ".wire-init-" + randomUUID());
            try {
              new SqliteRegistry(staged);
              await link(staged, fullRegistryPath);
            } finally { await unlink(staged).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; }); }
          } else throw new Error(backend);
          const parent = await open(dirname(fullRegistryPath), "r");
          try { await parent.sync(); } finally { await parent.close(); }
        }
        // A previous process may have completed storage creation and died
        // before publishing config. Validate that storage before adoption.
        if (!configured) {
          const registry = backend === "sqlite" ? new SqliteRegistry(fullRegistryPath, false) : new FileRegistry(fullRegistryPath, false);
          await registry.listResources();
        }
        await markRegistryReady(wireRoot);
        if (!configured) await writeConfig(wireRoot, config);
        return result(true);
      });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("Another Wire operation owns") || attempt >= 8) throw e;
      await new Promise(r => setTimeout(r, 5 * (attempt + 1)));
    }
  }
}

// Stays outside the registry so removal of the registry cannot be confused
// with a hand-written config that never had any storage.
async function markRegistryReady(wireRoot: string) {
  const history = join(wireRoot, "history");
  await mkdir(join(history, "registry-ready"), {recursive:true, mode:0o700});
  const dir = await open(history, "r");
  try { await dir.sync(); } finally { await dir.close(); }
}

async function writeConfig(wireRoot: string, config: WireConfig) {
  const nextConfig = join(wireRoot, randomUUID());
  try {
    const handle = await open(nextConfig, "wx", 0o600);
    try { await handle.writeFile(stableJsonPretty(config) + "\n"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(nextConfig, join(wireRoot, "config.json"));
    const directory = await open(wireRoot, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(nextConfig).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; }); }
}

export async function switchWireBackend(path: string, home: string): Promise<SwitchedWireBackend> {
  const wireRoot = await discoverWireRoot(path, home);
  return withBackendSwitch(wireRoot, async () => {
    const config = await loadWireConfig(wireRoot);
    const fromPath = join(wireRoot, config.path);
    protectHistory(wireRoot, fromPath);
    const source = config.backend === "sqlite" ? new SqliteRegistry(fromPath, false) : new FileRegistry(fromPath, false);
    const resources = await source.listResources();
    const to = config.backend === "sqlite" ? "files" : "sqlite";
    const targetRelativePath = registryPathForBackend(to);
    const toPath = join(wireRoot, targetRelativePath);
    const canonicalSource = canonicalPath(fromPath);
    const canonicalTarget = canonicalPath(toPath);
    protectHistory(wireRoot, toPath);
    if (canonicalSource === canonicalTarget || canonicalSource.startsWith(`${canonicalTarget}${sep}`) || canonicalTarget.startsWith(`${canonicalSource}${sep}`)) {
      throw new Error(`Cannot switch storage backends because registry paths overlap: ${fromPath} and ${toPath}. Move the source registry and update config.json before switching.`);
    }
    try {
      if (to === "sqlite") {
        // SQLite can recover or remove its sidecar files on open. Refuse all
        // occupied destination names, including dangling symlinks.
        for (const suffix of ["-journal", "-wal", "-shm"]) {
          const occupied = await lstat(toPath + suffix).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
          if (occupied) throw new Error("Wire switch destination already exists: " + toPath + suffix);
        }
        await (await open(toPath, "wx", 0o600)).close();
      } else await mkdir(toPath, {mode: 0o700});
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Wire switch destination already exists: " + toPath);
      throw e;
    }
    const target = to === "sqlite" ? new SqliteRegistry(toPath) : new FileRegistry(toPath);
    for (const resource of resources) await target.put(resource);
    await markRegistryReady(wireRoot);
    await writeConfig(wireRoot, { ...config, backend: to, path: targetRelativePath });
    // Remove only records we actually copied. Leave unrelated files alone.
    if (source instanceof FileRegistry) {
      for (const r of resources) await source.delete(r.id);
      await rmdir(fromPath).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOTEMPTY") throw e; });
    } else await unlink(fromPath);
    return { root: wireRoot, from: config.backend, to, fromPath, toPath, resources: resources.length };
  });
}
