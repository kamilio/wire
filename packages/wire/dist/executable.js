import { existsSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRoot } from "./adapters/root.js";
import { composeAuth } from "./auth.js";
import { serviceCatalog } from "./adapters/services/catalog.js";
import { withWireHooks } from "./hooks.js";
import { composeWire, configuredWireRoot, createCookiesCapability, createGoogleTokensCapability, createNodeClock, createNodeConfiguration, createNodeFilesystem, createNodeHttp, createNodeOpenFiles, createNodeProcess, createNodeSecrets, createNodeWatch, extractChromeCookies, initializeWire, loadWireConfig, openWireRegistry, switchWireBackend, wireRelativePath } from "wire-core";
function readStandardInput() {
    process.stdin.setEncoding("utf8");
    let contents = "";
    process.stdin.on("data", (chunk) => { contents += chunk; });
    return new Promise((resolve) => { process.stdin.on("end", () => resolve(contents)); });
}
function discoverRepositoryRoot(path) {
    let current = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
    for (;;) {
        const secrets = join(current, ["op", "secrets"].join("_").concat(".", "py"));
        if (existsSync(secrets) && statSync(secrets).isFile())
            return current;
        const parent = dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
function discoverConfiguredWireRoot(path, home) {
    let current = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
    for (;;) {
        const wireRoot = join(current, ".wire");
        const configPath = join(wireRoot, "config.json");
        if (existsSync(configPath) && statSync(configPath).isFile())
            return wireRoot;
        const parent = dirname(current);
        if (parent === current) {
            const homeWireRoot = join(home, ".wire");
            const homeConfigPath = join(homeWireRoot, "config.json");
            return existsSync(homeConfigPath) && statSync(homeConfigPath).isFile() ? homeWireRoot : undefined;
        }
        current = parent;
    }
}
function loadConfiguredEnvironment(environment, currentDirectory) {
    const home = environment["HOME"];
    if (home === undefined)
        throw new Error("Missing required environment variable: HOME");
    const wireRoot = discoverConfiguredWireRoot(currentDirectory, home);
    if (wireRoot === undefined)
        return environment;
    const config = JSON.parse(readFileSync(join(wireRoot, "config.json"), "utf8"));
    return config.env === undefined ? environment : Object.freeze({ ...environment, ...config.env });
}
export function createExecutableRoot(environment, currentDirectory) {
    const repositoryRoot = environment["WIRE_REPOSITORY_ROOT"] ?? discoverRepositoryRoot(currentDirectory);
    const baseEnvironment = repositoryRoot === undefined ? environment : Object.freeze({ ...environment, WIRE_REPOSITORY_ROOT: repositoryRoot });
    const resolvedEnvironment = loadConfiguredEnvironment(baseEnvironment, currentDirectory);
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
    let auth;
    const runtime = Object.freeze({ ...runtimeBase, cookies: createCookiesCapability(filesystem, () => home, () => resolvedEnvironment["WIRE_REPOSITORY_ROOT"]) });
    auth = composeAuth(runtime, resolvedEnvironment, extractChromeCookies);
    const wire = withWireHooks(composeWire({
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
    }), { currentDirectory, home, environment: resolvedEnvironment });
    return createRoot(wire, currentDirectory, auth, readStandardInput);
}
//# sourceMappingURL=executable.js.map