import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { addAsanaComment, createAsanaTask, editAsanaComment, editAsanaTask, listAsanaProjects, listAsanaTasks, lookupAsanaUsers, moveAsanaTask, showAsanaProject, showAsanaTask } from "provider-asana";
import { sendSlackMessage, editSlackMessage, lookupSlackUsers } from "provider-slack";

import { listLatticeReviewRequests, latticeReviewDraft, syncLatticeDrafts } from "provider-lattice";
import { zoomProvider } from "provider-zoom";
import { lookupNotionUsers } from "provider-notion";

import { readAgenda } from "./adapters/calendar.js";
import { createRoot } from "./adapters/root.js";
import { composeAuth } from "./auth.js";
import { serviceCatalog } from "./adapters/services/catalog.js";
import { withWireHooks } from "./hooks.js";
import { composeWire, configuredWireRoot, createCookiesCapability, createGoogleTokensCapability, createNodeClock, createNodeConfiguration, createNodeFilesystem, createNodeHttp, createNodeOpenFiles, createNodeProcess, createNodeSecrets, createNodeWatch, defaultWireBackend, defaultWireRegistryPath, extractChromeCookies, initializeWire, loadWireConfig, openWireRegistry, switchWireBackend, wireRelativePath, type NodeEnvironment } from "wire-core";
import type { WireConfig } from "wire-core";

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

function discoverConfiguredWireRoot(path: string, home: string): string | undefined {
  let current = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
  for (;;) {
    const wireRoot = join(current, ".wire");
    const configPath = join(wireRoot, "config.json");
    if (existsSync(configPath) && statSync(configPath).isFile()) return wireRoot;
    const parent = dirname(current);
    if (parent === current) {
      const homeWireRoot = join(home, ".wire");
      const homeConfigPath = join(homeWireRoot, "config.json");
      return existsSync(homeConfigPath) && statSync(homeConfigPath).isFile() ? homeWireRoot : undefined;
    }
    current = parent;
  }
}

function loadConfiguredEnvironment(environment: NodeEnvironment, currentDirectory: string): NodeEnvironment {
  const home = environment["HOME"];
  if (home === undefined) throw new Error("Missing required environment variable: HOME");
  const wireRoot = discoverConfiguredWireRoot(currentDirectory, home);
  if (wireRoot === undefined) return environment;
  const config = JSON.parse(readFileSync(join(wireRoot, "config.json"), "utf8")) as WireConfig;
  return config.env === undefined ? environment : Object.freeze({ ...environment, ...config.env });
}

function operationPath(value: string, path: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return path;
  return isAbsolute(value) ? value : resolve(path, value);
}

export function createExecutableRoot(environment: NodeEnvironment, currentDirectory: string, options = { allowPaste: true }) {
  const repositoryRoot = environment["WIRE_REPOSITORY_ROOT"] ?? discoverRepositoryRoot(currentDirectory);
  const baseEnvironment = repositoryRoot === undefined ? environment : Object.freeze({ ...environment, WIRE_REPOSITORY_ROOT: repositoryRoot });
  let activeConfigurationPath = currentDirectory;
  const configuredEnvironment = () => loadConfiguredEnvironment(baseEnvironment, activeConfigurationPath);
  const http = createNodeHttp();
  const filesystem = createNodeFilesystem();
  const processCapability = createNodeProcess();
  const clock = createNodeClock();
  const configuration = Object.freeze({ get: (name: string) => createNodeConfiguration(configuredEnvironment()).get(name), getOptional: (name: string) => configuredEnvironment()[name] });
  const home = configuration.get("HOME");
  const runtimeBase = {
    http,
    filesystem,
    process: processCapability,
    clock,
    openFiles: createNodeOpenFiles(processCapability),
    configuration,
    secrets: createNodeSecrets(filesystem, configuredEnvironment()),
    gmailTokens: Object.freeze({ load: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).load(), refresh: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).refresh() }),
    googleFormsTokens: Object.freeze({ load: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_FORMS_TOKEN_FILE")).load(), refresh: () => createGoogleTokensCapability(filesystem, http, clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_FORMS_TOKEN_FILE")).refresh() }),
  };
  let auth: ReturnType<typeof composeAuth>;
  const runtime = Object.freeze({ ...runtimeBase, cookies: createCookiesCapability(filesystem, () => home, () => configuredEnvironment()["WIRE_REPOSITORY_ROOT"]) });
  auth = composeAuth(runtime, configuredEnvironment(), extractChromeCookies);
  const baseWire = composeWire({
    home,
    fetchInput: runtime,
    catalog: serviceCatalog,
    filesystem: {
      exists: async (path) => existsSync(path),
      isFile: async (path) => existsSync(path) && statSync(path).isFile(),
      readText: runtime.filesystem.readText,
      writeText: async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents, "utf8"); },
      createText: async (path, contents) => {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        try { await writeFile(path, contents, { flag: "wx", mode: 0o600 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
        return true;
      },
      writeBytes: async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents); },
    },
    workspace: {
      configuredRoot: configuredWireRoot,
      initialize: initializeWire,
      loadConfig: loadWireConfig,
      openRegistry: openWireRegistry,
      relativePath: wireRelativePath,
      switchBackend: switchWireBackend,
    },
    initialization: { backend: defaultWireBackend, registryPath: defaultWireRegistryPath },
    watch: createNodeWatch(),
    now: runtime.clock.now,
    open: runtime.openFiles.open,
  });
  const configuredWire = Object.freeze({
    ...baseWire,
    attach: async (url: string, path: string) => { activeConfigurationPath = path; return baseWire.attach(url, path); },
    create: async (url: string, path: string) => { activeConfigurationPath = path; return baseWire.create(url, path); },
    view: async (url: string) => { activeConfigurationPath = currentDirectory; return baseWire.view(url); },
    downloadSource: async (url: string, path: string) => { activeConfigurationPath = path; return baseWire.downloadSource(url, path); },
    sync: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.sync(value, path); },
    download: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.download(value, path); },
    detach: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.detach(value, path); },
    unlink: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.unlink(value, path); },
    watch: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.watch(value, path); },
    openResource: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.openResource(value, path); },
    syncAll: async (path: string) => { activeConfigurationPath = path; return baseWire.syncAll(path); },
    listResources: async (path: string) => { activeConfigurationPath = path; return baseWire.listResources(path); },
    showResource: async (value: string, path: string) => { activeConfigurationPath = operationPath(value, path); return baseWire.showResource(value, path); },
    init: baseWire.init,
    switchBackend: baseWire.switchBackend,
  });
  const wire = withWireHooks(configuredWire, { currentDirectory, home, environment: configuredEnvironment() });
  return createRoot(wire, currentDirectory, auth, readStandardInput, { ...options, calendarAgenda: (date, id) => readAgenda(processCapability, configuration.get("WIRE_REPOSITORY_ROOT"), date, id), latticeSync: (url,file) => syncLatticeDrafts(runtime,url,currentDirectory,file), latticeRequests: url => listLatticeReviewRequests(runtime,url), latticeTemplate: url => latticeReviewDraft(runtime,url), latticeFill: async (url,file) => latticeReviewDraft(runtime,url,await runtime.filesystem.readText(resolve(currentDirectory,file))), scrapeZoom: () => zoomProvider.scrape(runtime, currentDirectory) }, (destination, markdown) => sendSlackMessage(runtime, destination, markdown), (query) => lookupSlackUsers(runtime, query), (url, markdown) => editSlackMessage(runtime, url, markdown), (query) => lookupNotionUsers(runtime, query), {
    lookup: (query) => lookupAsanaUsers(runtime, query), projects: () => listAsanaProjects(runtime), project: (project) => showAsanaProject(runtime, project), tasks: (project) => listAsanaTasks(runtime, project), show: (task) => showAsanaTask(runtime, task),
    writes: { move: (task, project, section) => moveAsanaTask(runtime, task, project, section), create: (project, title, section, body, assignee) => createAsanaTask(runtime, project, title, section, body, assignee), edit: (task, fields) => editAsanaTask(runtime, task, fields), comment: (task, body) => addAsanaComment(runtime, task, body), editComment: (comment, body) => editAsanaComment(runtime, comment, body) },
  }, async () => {
    const domains = new Set((await runtime.cookies.load("latticehq")).map(c => c.domain.replace(/^\./,"")).filter(d => /^[a-z0-9-]+\.latticehq\.com$/.test(d)));
    if (domains.size !== 1) throw new Error("Use wire download with your Lattice workspace URL.");
    return "https://" + [...domains][0] + "/";
  });
}
