import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createRoot } from "./adapters/root.js";
import { composeAuth } from "./auth.js";
import { serviceCatalog } from "./adapters/services/catalog.js";
import { composeWire, configuredWireRoot, createCookiesCapability, createGoogleTokensCapability, createNodeClock, createNodeConfiguration, createNodeFilesystem, createNodeHttp, createNodeOpenFiles, createNodeProcess, createNodeSecrets, createNodeWatch, extractChromeCookies, initializeWire, loadWireConfig, openWireRegistry, switchWireBackend, wireRelativePath, type NodeEnvironment } from "wire-core";

function readStandardInput(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let contents = "";
  process.stdin.on("data", (chunk) => { contents += chunk; });
  return new Promise((resolve) => { process.stdin.on("end", () => resolve(contents)); });
}

function discoverRepositoryRoot(path: string): string | undefined {
  let current = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
  for (;;) {
    const secrets = join(current, ["op", "secrets"].join("_").concat(".", "py"));
    if (existsSync(secrets) && statSync(secrets).isFile()) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function createExecutableRoot(environment: NodeEnvironment, currentDirectory: string) {
  const repositoryRoot = environment["WIRE_REPOSITORY_ROOT"] ?? discoverRepositoryRoot(currentDirectory);
  const resolvedEnvironment = repositoryRoot === undefined ? environment : Object.freeze({ ...environment, WIRE_REPOSITORY_ROOT: repositoryRoot });
  const http = createNodeHttp();
  const filesystem = createNodeFilesystem();
  const processCapability = createNodeProcess();
  const clock = createNodeClock();
  const configuration = createNodeConfiguration(resolvedEnvironment);
  const home = configuration.get("HOME");
  const runtimeBase = {
    http,
    filesystem,
    process: processCapability,
    clock,
    openFiles: createNodeOpenFiles(processCapability),
    configuration,
    secrets: createNodeSecrets(filesystem, resolvedEnvironment),
    gmailTokens: Object.freeze({ load: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).load(), refresh: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).refresh() }),
  };
  let auth: ReturnType<typeof composeAuth>;
  const runtime = Object.freeze({ ...runtimeBase, cookies: createCookiesCapability(filesystem, () => home, () => resolvedEnvironment["WIRE_REPOSITORY_ROOT"]) });
  auth = composeAuth(runtime, resolvedEnvironment, extractChromeCookies);
  const wire = composeWire({
    home,
    fetchInput: runtime,
    catalog: serviceCatalog,
    filesystem: {
      exists: async (path) => existsSync(path),
      isFile: async (path) => existsSync(path) && statSync(path).isFile(),
      readText: runtime.filesystem.readText,
      writeText: (path, contents) => writeFile(path, contents, "utf8"),
    },
    workspace: {
      configuredRoot: configuredWireRoot,
      initialize: initializeWire,
      loadConfig: loadWireConfig,
      openRegistry: openWireRegistry,
      relativePath: wireRelativePath,
      switchBackend: switchWireBackend,
    },
    initialization: { backend: "sqlite", registryPath: "registry.sqlite3" },
    watch: createNodeWatch(),
    now: runtime.clock.now,
    open: runtime.openFiles.open,
  });
  return createRoot(wire, currentDirectory, auth, readStandardInput);
}
