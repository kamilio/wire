import { execFile } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { createCookiesCapability } from "./cookies.js";
import { createGoogleTokensCapability } from "./google.js";
const execFileAsync = promisify(execFile);
function environmentValue(environment, name) {
    const value = environment[name];
    if (value === undefined)
        throw new Error(`Missing required environment variable: ${name}`);
    return value;
}
export function createNodeHttp() {
    return Object.freeze({ request: (input, init) => fetch(input, init) });
}
export function createNodeFilesystem() {
    return Object.freeze({
        exists: async (path) => existsSync(path),
        readText: (path) => readFile(path, "utf8"),
        writeText: async (path, contents) => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, contents, "utf8");
        },
        delete: (path) => rm(path, { force: true }),
    });
}
export function createNodeProcess() {
    return Object.freeze({
        execute: async (command, args, environment) => {
            const result = await execFileAsync(command, [...args], { encoding: "utf8", ...(environment === undefined ? {} : { env: environment }) });
            return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
        },
    });
}
export function createNodeClock() {
    return Object.freeze({
        now: () => new Date(),
        localTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }),
    });
}
export function createNodeOpenFiles(processCapability) {
    return Object.freeze({ open: async (path) => { await processCapability.execute("open", [path]); } });
}
export function createNodeWatch() {
    return Object.freeze({
        watchFile: (path, onChange) => {
            const watcher = watch(path, () => { void onChange(); });
            return Object.freeze({ close: () => watcher.close() });
        },
        every: (milliseconds, onTick) => {
            const timer = setInterval(() => { void onTick(); }, milliseconds);
            return Object.freeze({ close: () => clearInterval(timer) });
        },
    });
}
export function createNodeConfiguration(environment) {
    return Object.freeze({ get: (name) => environmentValue(environment, name) });
}
export function createNodeSecrets(filesystem, environment) {
    return Object.freeze({
        get: async (reference) => JSON.parse(await filesystem.readText(environmentValue(environment, "WIRE_OP_SECRETS_CACHE_FILE")))[reference],
    });
}
export function composeNodeRuntime(dependencies) {
    const configuration = createNodeConfiguration(dependencies.environment);
    return Object.freeze({
        http: dependencies.http,
        filesystem: dependencies.filesystem,
        process: dependencies.process,
        clock: dependencies.clock,
        openFiles: createNodeOpenFiles(dependencies.process),
        configuration,
        secrets: createNodeSecrets(dependencies.filesystem, dependencies.environment),
        cookies: createCookiesCapability(dependencies.filesystem, () => configuration.get("HOME"), () => dependencies.environment["WIRE_REPOSITORY_ROOT"]),
        gmailTokens: Object.freeze({
            load: () => createGoogleTokensCapability(dependencies.filesystem, dependencies.http, dependencies.clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).load(),
            refresh: () => createGoogleTokensCapability(dependencies.filesystem, dependencies.http, dependencies.clock, configuration.get("GOOGLE_CREDENTIALS_FILE"), configuration.get("GOOGLE_TOKEN_FILE")).refresh(),
        }),
    });
}
export function createNodeRuntime(environment) {
    return composeNodeRuntime({
        environment,
        http: createNodeHttp(),
        filesystem: createNodeFilesystem(),
        process: createNodeProcess(),
        clock: createNodeClock(),
    });
}
//# sourceMappingURL=node.js.map