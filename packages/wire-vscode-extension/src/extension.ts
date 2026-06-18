import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { composeWire, createGoogleTokensCapability, parseNetscapeCookies, parsePastedCookieMetadata, type Cookie, type CookiesCapability, type RuntimeCapabilities } from "wire-core";
import { serviceCatalog } from "./service-catalog.js";
import { configuredWireRoot, initializeWire, loadWireConfig, openWireRegistry, wireRelativePath } from "./workspace.js";

const execFileAsync = promisify(execFile);
const authServices = ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"] as const;

function setting(name: string): string {
  const value = vscode.workspace.getConfiguration().get<string>(name);
  if (value === undefined || value.trim() === "") throw new Error(`Missing VSCode setting: ${name}`);
  return value;
}

function serviceSetting(service: string): string {
  return {
    asana: "wire.auth.asanaCookiesFile",
    chatgpt: "wire.auth.chatgptCookiesFile",
    gmail: "wire.auth.gmailCookiesFile",
    "google-docs": "wire.auth.googleDocsCookiesFile",
    notion: "wire.auth.notionCookiesFile",
    slack: "wire.auth.slackCookiesFile",
    zoom: "wire.auth.zoomCookiesFile"
  }[service]!;
}

function environment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function cookiesCapability(): CookiesCapability {
  const load = async (service: string): Promise<readonly Cookie[]> => parseNetscapeCookies(await readFile(setting(serviceSetting(service)), "utf8"));
  return {
    load,
    loadSaved: load,
    metadata: async (service: string) => parsePastedCookieMetadata(await readFile(setting(serviceSetting(service)), "utf8")),
    delete: async (service: string) => { await rm(setting(serviceSetting(service))); }
  };
}

function runtime(): RuntimeCapabilities {
  const filesystem = {
    exists: async (path: string) => existsSync(path),
    readText: (path: string) => readFile(path, "utf8"),
    writeText: async (path: string, contents: string) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, "utf8");
    },
    delete: (path: string) => rm(path)
  };
  const clock = {
    now: () => new Date(),
    localTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone: (name: string) => new Intl.DateTimeFormat("en-US", { timeZone: name })
  };
  return {
    http: { request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) },
    filesystem,
    process: { execute: async (command: string, args: readonly string[]) => {
      const result = await execFileAsync(command, [...args], { encoding: "utf8" });
      return { stdout: result.stdout, stderr: result.stderr };
    } },
    clock,
    openFiles: { open: async (path: string) => { await vscode.env.openExternal(vscode.Uri.parse(path)); } },
    configuration: { get: setting },
    secrets: { get: async (reference: string) => { throw new Error(`Missing secret provider for ${reference}`); } },
    cookies: cookiesCapability(),
    gmailTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) }, clock, setting("wire.google.credentialsFile"), setting("wire.google.tokenFile")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) }, clock, setting("wire.google.credentialsFile"), setting("wire.google.tokenFile")).refresh()
    }
  };
}

function wire() {
  const capabilities = runtime();
  return composeWire({
    home: environment("HOME"),
    fetchInput: capabilities,
    catalog: serviceCatalog,
    filesystem: {
      exists: async (path: string) => existsSync(path),
      isFile: async (path: string) => existsSync(path) && statSync(path).isFile(),
      readText: capabilities.filesystem.readText,
      writeText: capabilities.filesystem.writeText
    },
    workspace: {
      configuredRoot: configuredWireRoot,
      initialize: initializeWire,
      loadConfig: loadWireConfig,
      openRegistry: openWireRegistry,
      relativePath: wireRelativePath
    },
    initialization: { backend: "files", registryPath: "records" },
    now: capabilities.clock.now,
    open: capabilities.openFiles.open
  });
}

function selectedPath(uri: vscode.Uri | undefined): string {
  if (uri !== undefined && uri.scheme === "file") return uri.fsPath;
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined || editor.document.uri.scheme !== "file") throw new Error("No file selected");
  return editor.document.uri.fsPath;
}

function selectedDirectory(uri: vscode.Uri | undefined): string {
  const path = selectedPath(uri);
  return existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
}

function resourceFile(uri: vscode.Uri | undefined): string {
  const path = selectedPath(uri);
  if (!statSync(path).isFile()) throw new Error(`Expected file: ${path}`);
  return path;
}

function title(resource: { data: readonly { namespace: string; key: string; value: unknown }[] }): string {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "title")!.value as string;
}

function resultMessage(result: { resource: { data: readonly { namespace: string; key: string; value: unknown }[] }; summary: { action: string; added: number; modified: number; removed: number } }): string {
  return `${result.summary.action} +${result.summary.added} ~${result.summary.modified} -${result.summary.removed} ${title(result.resource)}`;
}

async function linkHere(uri: vscode.Uri | undefined): Promise<void> {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === undefined || url.trim() === "") throw new Error("Source URL required");
  const result = await wire().create(url, directory);
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  vscode.window.showInformationMessage(resultMessage(result));
}

async function syncFile(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const result = await wire().sync(path, dirname(path));
  vscode.window.showInformationMessage(resultMessage(result));
}

async function downloadFile(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const result = await wire().download(path, dirname(path));
  vscode.window.showInformationMessage(resultMessage(result));
}

async function openResource(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const resource = await wire().openResource(path, dirname(path));
  vscode.window.showInformationMessage(`opened ${title(resource)}`);
}

async function syncDirectory(uri: vscode.Uri | undefined): Promise<void> {
  const directory = selectedDirectory(uri);
  const results = await wire().syncAll(directory);
  vscode.window.showInformationMessage(`synced ${results.length} resources`);
}

async function authStatus(): Promise<void> {
  const service = await vscode.window.showQuickPick([...authServices], { placeHolder: "Service" });
  if (service === undefined) throw new Error("Service required");
  const cookies = await runtime().cookies.load(service);
  vscode.window.showInformationMessage(`${service} cookies: ${cookies.length}`);
}

async function compileAndReload(): Promise<void> {
  const root = resolve(__dirname, "..");
  await execFileAsync("node", ["bump-version.mjs", "patch"], { cwd: root });
  await execFileAsync("npm", ["run", "compile"], { cwd: root });
  await vscode.commands.executeCommand("workbench.action.reloadWindow");
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("wire-vscode.linkHere", linkHere),
    vscode.commands.registerCommand("wire-vscode.syncFile", syncFile),
    vscode.commands.registerCommand("wire-vscode.downloadFile", downloadFile),
    vscode.commands.registerCommand("wire-vscode.openResource", openResource),
    vscode.commands.registerCommand("wire-vscode.syncDirectory", syncDirectory),
    vscode.commands.registerCommand("wire-vscode.authStatus", authStatus),
    vscode.commands.registerCommand("wire-vscode.compileAndReload", compileAndReload)
  );
}

export function deactivate(): void {}
