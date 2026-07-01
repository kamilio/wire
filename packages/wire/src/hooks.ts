import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { Resource, Wire, WireResult, WireWatchSyncHook } from "wire-core";
import { configuredWireRoot, openWireRegistry, wireRelativePath, wireWatchHooks } from "wire-core";

const execFileAsync = promisify(execFile);

export type WireHookEvent = "post-resource" | "post-batch" | "post-command";

export type WireHookOptions = Readonly<{
  currentDirectory: string;
  home: string;
  environment: Readonly<Record<string, string | undefined>>;
}>;

type HookState = Readonly<{
  result: WireResult;
  environment: Readonly<Record<string, string>>;
}>;

function primaryFilesystemLink(resource: Resource) {
  return resource.filesystem_links.find((link) => link.role === "primary")!;
}

function wireTitle(resource: Resource): string {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "title")!.value as string;
}

async function hookCommandPaths(wireRoot: string, event: WireHookEvent): Promise<readonly string[]> {
  const hooksPath = join(wireRoot, "hooks");
  const eventPath = join(hooksPath, event);
  const paths: string[] = [];
  if (existsSync(eventPath)) paths.push(eventPath);
  const directoryPath = join(hooksPath, `${event}.d`);
  if (existsSync(directoryPath)) {
    const directory = statSync(directoryPath);
    if (!directory.isDirectory()) throw new Error(`Wire hook path is not a directory: ${directoryPath}`);
    for (const filename of (await readdir(directoryPath)).sort()) paths.push(join(directoryPath, filename));
  }
  for (const path of paths) {
    const file = statSync(path);
    if (!file.isFile()) throw new Error(`Wire hook path is not a file: ${path}`);
    if ((file.mode & 0o111) === 0) throw new Error(`Wire hook is not executable: ${path}`);
  }
  return paths;
}

function changedWireResult(result: WireResult): boolean {
  return result.summary.action !== "synced" || result.summary.added !== 0 || result.summary.modified !== 0 || result.summary.removed !== 0;
}

function stringEnvironment(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) if (value !== undefined) result[name] = value;
  return result;
}

function resourceEnvironment(command: string, currentDirectory: string, wireRoot: string, result: WireResult): Record<string, string> {
  const primary = primaryFilesystemLink(result.resource);
  const service = result.resource.identifiers[0]!.service;
  return {
    WIRE_EVENT: "post-resource",
    WIRE_COMMAND: command,
    WIRE_CWD: currentDirectory,
    WIRE_WORKSPACE: dirname(wireRoot),
    WIRE_ROOT: wireRoot,
    WIRE_RESOURCE_ID: result.resource.id,
    WIRE_SERVICE: service,
    WIRE_TITLE: wireTitle(result.resource),
    WIRE_PATH: result.path,
    WIRE_LOCAL: primary.path,
    WIRE_REMOTE: result.summary.remote,
    WIRE_ACTION: result.summary.action,
    WIRE_ADDED: String(result.summary.added),
    WIRE_MODIFIED: String(result.summary.modified),
    WIRE_REMOVED: String(result.summary.removed),
  };
}

function summaryEnvironment(event: WireHookEvent, command: string, currentDirectory: string, wireRoot: string, results: readonly WireResult[]): Record<string, string> {
  return {
    WIRE_EVENT: event,
    WIRE_COMMAND: command,
    WIRE_CWD: currentDirectory,
    WIRE_WORKSPACE: dirname(wireRoot),
    WIRE_ROOT: wireRoot,
    WIRE_RESULT_COUNT: String(results.length),
    WIRE_CHANGED_COUNT: String(results.filter(changedWireResult).length),
    WIRE_FAILED_COUNT: String(results.filter((result) => result.summary.action === "failed").length),
  };
}

function outputEnvironment(stdout: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of stdout.split(/\r\n|\n|\r/)) {
    if (!/^WIRE_[A-Za-z0-9_]+=/.test(line)) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

async function updateMovedResult(options: WireHookOptions, wireRoot: string, result: WireResult, movedPath: string): Promise<WireResult> {
  const workspace = dirname(wireRoot);
  const outputPath = isAbsolute(movedPath) ? movedPath : resolve(workspace, movedPath);
  const relativePath = wireRelativePath(outputPath, wireRoot);
  const primary = primaryFilesystemLink(result.resource);
  const resource = {
    ...result.resource,
    filesystem_links: [
      ...result.resource.filesystem_links.filter((link) => !(link.path === primary.path && link.role === "primary")),
      { ...primary, path: relativePath },
    ],
  };
  if (result.summary.action !== "detached") await (await openWireRegistry(wireRoot, options.home)).put(resource);
  return { ...result, resource, path: outputPath, summary: { ...result.summary, local: outputPath } };
}

async function runHookCommands(wireRoot: string, event: WireHookEvent, environment: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  let current = { ...environment };
  for (const path of await hookCommandPaths(wireRoot, event)) {
    const result = await execFileAsync(path, [], { cwd: dirname(wireRoot), env: current, encoding: "utf8" });
    current = { ...current, ...outputEnvironment(result.stdout) };
  }
  return current;
}

async function runResourceHooks(options: WireHookOptions, command: string, result: WireResult): Promise<HookState> {
  const wireRoot = (await configuredWireRoot(result.path, options.home))!;
  let currentResult = result;
  let environment = {
    ...stringEnvironment(options.environment),
    ...resourceEnvironment(command, options.currentDirectory, wireRoot, currentResult),
  };
  for (const path of await hookCommandPaths(wireRoot, "post-resource")) {
    const hookResult = await execFileAsync(path, [], { cwd: dirname(wireRoot), env: environment, encoding: "utf8" });
    const output = outputEnvironment(hookResult.stdout);
    environment = { ...environment, ...output };
    const outputPath = output["WIRE_PATH"];
    if (outputPath !== undefined && resolve(dirname(wireRoot), outputPath) !== currentResult.path) {
      currentResult = await updateMovedResult(options, wireRoot, currentResult, outputPath);
      environment = { ...environment, ...resourceEnvironment(command, options.currentDirectory, wireRoot, currentResult) };
    }
  }
  return { result: currentResult, environment };
}

async function runSummaryHooks(options: WireHookOptions, event: WireHookEvent, command: string, rootPath: string, results: readonly WireResult[], environment: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  const wireRoot = (await configuredWireRoot(rootPath, options.home))!;
  return runHookCommands(wireRoot, event, {
    ...stringEnvironment(options.environment),
    ...environment,
    ...summaryEnvironment(event, command, options.currentDirectory, wireRoot, results),
  });
}

async function runSingleResultHooks(options: WireHookOptions, command: string, result: WireResult): Promise<WireResult> {
  const state = result.summary.action === "failed" ? { result, environment: {} } : await runResourceHooks(options, command, result);
  await runSummaryHooks(options, "post-command", command, state.result.path, [state.result], state.environment);
  return state.result;
}

async function runBatchHooks(options: WireHookOptions, command: string, results: readonly WireResult[]): Promise<readonly WireResult[]> {
  const updated: WireResult[] = [];
  let environment: Record<string, string> = {};
  for (const result of results) {
    if (result.summary.action === "failed") {
      updated.push(result);
    } else {
      const state = await runResourceHooks(options, command, result);
      updated.push(state.result);
      environment = { ...environment, ...state.environment };
    }
  }
  const rootPath = updated[0]?.path ?? options.currentDirectory;
  environment = await runSummaryHooks(options, "post-batch", command, rootPath, updated, environment);
  await runSummaryHooks(options, "post-command", command, rootPath, updated, environment);
  return updated;
}

export function withWireHooks(wire: Wire, options: WireHookOptions): Wire {
  const watchSyncHook: WireWatchSyncHook = (command, result) => runSingleResultHooks(options, command, result);
  return Object.freeze({
    ...wire,
    attach: async (url, path) => runSingleResultHooks(options, "attach", await wire.attach(url, path)),
    create: async (url, path) => runSingleResultHooks(options, "attach", await wire.create(url, path)),
    sync: async (value, path) => runSingleResultHooks(options, "sync", await wire.sync(value, path)),
    downloadSource: async (url, path) => runSingleResultHooks(options, "download", await wire.downloadSource(url, path)),
    download: async (value, path) => runSingleResultHooks(options, "download", await wire.download(value, path)),
    detach: async (value, path) => runSingleResultHooks(options, "detach", await wire.detach(value, path)),
    unlink: async (value, path) => runSingleResultHooks(options, "detach", await wire.unlink(value, path)),
    watch: async (value, path) => (wire as Wire & { [wireWatchHooks](value: string, path: string, hooks: readonly WireWatchSyncHook[]): ReturnType<Wire["watch"]> })[wireWatchHooks](value, path, [watchSyncHook]),
    syncAll: async (path) => runBatchHooks(options, "sync-all", await wire.syncAll(path)),
  });
}
