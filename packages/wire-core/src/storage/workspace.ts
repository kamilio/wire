import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

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
  if (config.backend === "sqlite") return new SqliteRegistry(registryPath);
  if (config.backend === "files") return new FileRegistry(registryPath);
  throw new Error(config.backend);
}

export async function initializeWire(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire> {
  const wireRoot = join(canonicalPath(path), ".wire");
  await mkdir(wireRoot, { recursive: true });
  const configPath = join(wireRoot, "config.json");
  if (existsSync(configPath) && statSync(configPath).isFile()) {
    const existing = await loadWireConfig(wireRoot);
    if (existing.backend !== backend || existing.path !== registryPath) throw new Error(`Wire workspace already initialized with ${existing.backend} registry at ${existing.path}. Existing registries are not overwritten.`);
    return { root: wireRoot, backend: existing.backend, path: join(wireRoot, existing.path), created: false };
  }
  const config = { backend, path: registryPath } satisfies WireConfig;
  await writeFile(configPath, `${stableJsonPretty(config)}\n`, "utf8");
  const fullRegistryPath = join(wireRoot, registryPath);
  if (backend === "sqlite") new SqliteRegistry(fullRegistryPath);
  else if (backend === "files") new FileRegistry(fullRegistryPath);
  else throw new Error(backend);
  return { root: wireRoot, backend, path: fullRegistryPath, created: true };
}

export async function switchWireBackend(path: string, home: string): Promise<SwitchedWireBackend> {
  const wireRoot = await discoverWireRoot(path, home);
  const config = await loadWireConfig(wireRoot);
  const fromPath = join(wireRoot, config.path);
  const source = config.backend === "sqlite" ? new SqliteRegistry(fromPath) : new FileRegistry(fromPath);
  const resources = await source.listResources();
  const to = config.backend === "sqlite" ? "files" : "sqlite";
  const targetRelativePath = registryPathForBackend(to);
  const toPath = join(wireRoot, targetRelativePath);
  await rm(toPath, { recursive: true, force: true });
  const target = to === "sqlite" ? new SqliteRegistry(toPath) : new FileRegistry(toPath);
  for (const resource of resources) await target.put(resource);
  await writeFile(join(wireRoot, "config.json"), `${stableJsonPretty({ ...config, backend: to, path: targetRelativePath })}\n`, "utf8");
  await rm(fromPath, { recursive: true, force: true });
  return { root: wireRoot, from: config.backend, to, fromPath, toPath, resources: resources.length };
}
