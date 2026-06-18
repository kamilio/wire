import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { stableJsonPretty, type InitializedWire, type Registry, type WireBackend, type WireConfig } from "wire-core";
import { FileRegistry } from "./file-registry.js";

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
  if (config.backend !== "files") throw new Error(`Wire VSCode extension requires files backend: ${config.backend}`);
  return new FileRegistry(join(wireRoot, config.path));
}

export async function initializeWire(path: string, backend: WireBackend, registryPath: string): Promise<InitializedWire> {
  if (backend !== "files") throw new Error(`Wire VSCode extension requires files backend: ${backend}`);
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
  await mkdir(join(wireRoot, registryPath), { recursive: true });
  return { root: wireRoot, backend, path: join(wireRoot, registryPath), created: true };
}
