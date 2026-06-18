import { execFile } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { createCookiesCapability } from "./cookies.js";
import { createGoogleTokensCapability } from "./google.js";
import type { ClockCapability, ConfigurationCapability, FilesystemCapability, HttpCapability, OpenFilesCapability, ProcessCapability, RuntimeCapabilities, SecretsCapability, WatchCapability } from "../ports.js";

const execFileAsync = promisify(execFile);

export type NodeEnvironment = Readonly<Record<string, string | undefined>>;

function environmentValue(environment: NodeEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createNodeHttp(): HttpCapability {
  return Object.freeze({ request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) });
}

export function createNodeFilesystem(): FilesystemCapability {
  return Object.freeze({
    exists: async (path: string) => existsSync(path),
    readText: (path: string) => readFile(path, "utf8"),
    writeText: async (path: string, contents: string) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, "utf8");
    },
    delete: (path: string) => rm(path, { force: true }),
  });
}

export function createNodeProcess(): ProcessCapability {
  return Object.freeze({
    execute: async (command: string, args: readonly string[], environment?: Readonly<Record<string, string>>) => {
      const result = await execFileAsync(command, [...args], { encoding: "utf8", ...(environment === undefined ? {} : { env: environment }) });
      return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
    },
  });
}

export function createNodeClock(): ClockCapability {
  return Object.freeze({
    now: () => new Date(),
    localTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone: (name: string) => new Intl.DateTimeFormat("en-US", { timeZone: name }),
  });
}

export function createNodeOpenFiles(processCapability: ProcessCapability): OpenFilesCapability {
  return Object.freeze({ open: async (path: string) => { await processCapability.execute("open", [path]); } });
}

export function createNodeWatch(): WatchCapability {
  return Object.freeze({
    watchFile: (path: string, onChange: () => void | Promise<void>) => {
      const watcher = watch(path, () => { void onChange(); });
      return Object.freeze({ close: () => watcher.close() });
    },
    every: (milliseconds: number, onTick: () => void | Promise<void>) => {
      const timer = setInterval(() => { void onTick(); }, milliseconds);
      return Object.freeze({ close: () => clearInterval(timer) });
    },
  });
}

export function createNodeConfiguration(environment: NodeEnvironment): ConfigurationCapability {
  return Object.freeze({ get: (name: string) => environmentValue(environment, name) });
}

export function createNodeSecrets(filesystem: FilesystemCapability, environment: NodeEnvironment): SecretsCapability {
  return Object.freeze({
    get: async (reference: string) => (JSON.parse(await filesystem.readText(environmentValue(environment, "WIRE_OP_SECRETS_CACHE_FILE"))) as Record<string, string>)[reference]!,
  });
}

export interface NodeRuntimeDependencies {
  readonly environment: NodeEnvironment;
  readonly http: HttpCapability;
  readonly filesystem: FilesystemCapability;
  readonly process: ProcessCapability;
  readonly clock: ClockCapability;
}

export function composeNodeRuntime(dependencies: NodeRuntimeDependencies): RuntimeCapabilities {
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

export function createNodeRuntime(environment: NodeEnvironment): RuntimeCapabilities {
  return composeNodeRuntime({
    environment,
    http: createNodeHttp(),
    filesystem: createNodeFilesystem(),
    process: createNodeProcess(),
    clock: createNodeClock(),
  });
}
