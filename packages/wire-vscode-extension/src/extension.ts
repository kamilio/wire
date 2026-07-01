import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { composeAuth, composeWire, configuredWireRoot, createCookiesCapability, createGoogleTokensCapability, defaultWireBackend, defaultWireRegistryPath, extractChromeCookies, initializeWire, loadWireConfig, openWireRegistry, wireRelativePath, type AuthResult, type AuthService, type RuntimeCapabilities, type WireResult } from "wire-core";
import { serviceCatalog } from "./service-catalog.js";

const execFileAsync = promisify(execFile);
const authServices = ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"] as const;
let wireStatus: vscode.StatusBarItem;

function environment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function repositoryRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
    configuration: { get: environment },
    secrets: { get: async (reference: string) => { throw new Error(`Missing secret provider for ${reference}`); } },
    cookies: createCookiesCapability(filesystem, () => environment("HOME"), repositoryRoot),
    gmailTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_TOKEN_FILE")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input: string | URL | Request, init?: RequestInit) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_TOKEN_FILE")).refresh()
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
    initialization: { backend: defaultWireBackend, registryPath: defaultWireRegistryPath },
    now: capabilities.clock.now,
    open: capabilities.openFiles.open
  });
}

function auth() {
  return composeAuth(runtime(), process.env, extractChromeCookies);
}

function setWireStatus(message: string): void {
  wireStatus.text = `$(plug) Wire: ${message}`;
  wireStatus.tooltip = message;
  wireStatus.show();
}

function showWireStatus(message: string): void {
  setWireStatus(message);
  vscode.window.showInformationMessage(message);
}

async function wireProgress<T>(message: string, operation: () => Promise<T>): Promise<T> {
  setWireStatus(message.toLowerCase());
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Wire - ${message}` }, operation);
}

type WireDisplayError = Readonly<{ message: string; command?: string }>;

function wireError(error: unknown): WireDisplayError | null {
  if (!(error instanceof Error)) return null;
  const login = /Run `([^`]+)`/.exec(error.message);
  if (login !== null) return { message: `Wire - Login required. Run in terminal: ${login[1]!}`, command: login[1]! };
  const missingGoogle = /^Missing environment variable: (GOOGLE_CREDENTIALS_FILE|GOOGLE_TOKEN_FILE)$/.exec(error.message);
  if (missingGoogle !== null) return { message: "Wire - Google login required. Run in terminal: wire google-docs login", command: "wire google-docs login" };
  const unregisteredPath = /^Resource path is not registered: ([\s\S]+)$/.exec(error.message);
  if (unregisteredPath !== null) return { message: `Wire - Not attached: ${unregisteredPath[1]}. Use Wire - Attach to track a source URL, or Wire - Download for a one-time copy.` };
  const missingPath = /^Resource path not found: ([\s\S]+)$/.exec(error.message);
  if (missingPath !== null) return { message: `Wire - Not found: ${missingPath[1]}.` };
  const missingWorkspace = /^Wire workspace not initialized\. Run `wire init` or `wire <url>` first\.$/.exec(error.message);
  if (missingWorkspace !== null) return { message: "Wire - Workspace is not initialized. Use Wire - Attach to start tracking a source URL." };
  const unsupportedSource = /^Unsupported source URL: ([\s\S]+)$/.exec(error.message);
  if (unsupportedSource !== null) return { message: `Wire - Unsupported source URL: ${unsupportedSource[1]}. Supported sources: Asana, ChatGPT, Gmail, Google Docs/Sheets/Slides, Notion, Slack, Zoom.` };
  return null;
}

function wireCommand<Args extends readonly unknown[]>(command: (...args: Args) => Promise<void>): (...args: Args) => Promise<void> {
  return async (...args) => {
    try {
      await command(...args);
    } catch (error) {
      const display = wireError(error);
      if (display === null) throw error;
      setWireStatus("error");
      const action = display.command === undefined ? await vscode.window.showErrorMessage(display.message) : await vscode.window.showErrorMessage(display.message, "Copy command");
      if (action === "Copy command") await vscode.env.clipboard.writeText(display.command!);
    }
  };
}

function identityText(result: AuthResult): string {
  const entries = Object.entries(result.identity);
  if (entries.length === 0) return result.service;
  return `${result.service} ${entries.map(([key, value]) => `${key}=${String(value).replace(/[\t\r\n]+/g, " ")}`).join(" ")}`;
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

function projectDirectory(): string {
  const root = repositoryRoot();
  if (root === undefined) throw new Error("No workspace folder open");
  return root;
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
  return `Wire - ${result.summary.action[0]!.toUpperCase()}${result.summary.action.slice(1)}: ${title(result.resource)}`;
}

async function showWireResultStatus(result: WireResult): Promise<void> {
  const message = resultMessage(result);
  setWireStatus(message);
  if (result.summary.action !== "uploaded") {
    vscode.window.showInformationMessage(message);
    return;
  }
  const action = await vscode.window.showInformationMessage(message, "Copy URL", "Open URL");
  if (action === "Copy URL") await vscode.env.clipboard.writeText(result.summary.remote);
  if (action === "Open URL") await vscode.env.openExternal(vscode.Uri.parse(result.summary.remote));
}

async function attachHere(uri: vscode.Uri | undefined): Promise<void> {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === undefined || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Attaching", () => wire().attach(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}

async function initProject(): Promise<void> {
  const directory = projectDirectory();
  const existingRoot = await configuredWireRoot(directory, environment("HOME"));
  if (existingRoot !== null) {
    const config = await loadWireConfig(existingRoot);
    showWireStatus(`Wire - Project ready: ${config.backend}`);
    return;
  }
  const result = await wireProgress("Initializing project", () => initializeWire(directory, defaultWireBackend, defaultWireRegistryPath));
  showWireStatus(`Wire - Project initialized: ${result.backend}`);
}

async function downloadHere(uri: vscode.Uri | undefined): Promise<void> {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === undefined || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Downloading", () => wire().downloadSource(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}

async function previewUrl(): Promise<void> {
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === undefined || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Previewing", () => wire().view(url));
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content: result.markdown });
  await vscode.window.showTextDocument(document);
  showWireStatus(`Wire - Previewed: ${result.title}`);
}

async function syncFile(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const result = await wireProgress("Syncing", () => wire().sync(path, dirname(path)));
  await showWireResultStatus(result);
}

async function detachFile(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const result = await wireProgress("Detaching", () => wire().detach(path, dirname(path)));
  await showWireResultStatus(result);
}

async function openResource(uri: vscode.Uri | undefined): Promise<void> {
  const path = resourceFile(uri);
  const resource = await wireProgress("Opening", () => wire().openResource(path, dirname(path)));
  showWireStatus(`Wire - Opened: ${title(resource)}`);
}

async function syncDirectory(uri: vscode.Uri | undefined): Promise<void> {
  const directory = selectedDirectory(uri);
  const results = await wireProgress("Syncing all", () => wire().syncAll(directory));
  showWireStatus(`Wire - Synced ${results.length} resources`);
}

async function selectedAuthService(): Promise<AuthService> {
  const service = await vscode.window.showQuickPick([...authServices], { placeHolder: "Service" });
  if (service === undefined) throw new Error("Service required");
  return service as AuthService;
}

async function authStatus(): Promise<void> {
  const service = await selectedAuthService();
  const result = await wireProgress("Checking login", () => auth().status(service));
  showWireStatus(`Wire - Authenticated: ${identityText(result)}`);
}

async function authLogin(): Promise<void> {
  const service = await selectedAuthService();
  const authClient = auth();
  const actions = {
    asana: authClient.extractAsana,
    chatgpt: authClient.extractChatgpt,
    gmail: authClient.extractGmail,
    "google-docs": authClient.extractGoogleDocs,
    notion: authClient.extractNotion,
    slack: authClient.extractSlack,
    zoom: authClient.extractZoom,
  };
  const result = await wireProgress("Logging in", () => actions[service]());
  showWireStatus(`Wire - Login saved: ${identityText(result)}`);
}

async function authLogout(): Promise<void> {
  const service = await selectedAuthService();
  await wireProgress("Logging out", () => auth().logout(service));
  showWireStatus(`Wire - Logged out: ${service}`);
}

async function compileAndReload(): Promise<void> {
  const root = resolve(__dirname, "..");
  await execFileAsync("node", ["bump-version.mjs", "patch"], { cwd: root });
  await execFileAsync("npm", ["run", "compile"], { cwd: root });
  await vscode.commands.executeCommand("workbench.action.reloadWindow");
}

export function activate(context: vscode.ExtensionContext): void {
  wireStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  setWireStatus("ready");
  context.subscriptions.push(
    wireStatus,
    vscode.commands.registerCommand("wire.initProject", wireCommand(initProject)),
    vscode.commands.registerCommand("wire.attachHere", wireCommand(attachHere)),
    vscode.commands.registerCommand("wire.downloadHere", wireCommand(downloadHere)),
    vscode.commands.registerCommand("wire.previewUrl", wireCommand(previewUrl)),
    vscode.commands.registerCommand("wire.syncFile", wireCommand(syncFile)),
    vscode.commands.registerCommand("wire.detachFile", wireCommand(detachFile)),
    vscode.commands.registerCommand("wire.openResource", wireCommand(openResource)),
    vscode.commands.registerCommand("wire.syncDirectory", wireCommand(syncDirectory)),
    vscode.commands.registerCommand("wire.authStatus", wireCommand(authStatus)),
    vscode.commands.registerCommand("wire.authLogin", wireCommand(authLogin)),
    vscode.commands.registerCommand("wire.authLogout", wireCommand(authLogout)),
    vscode.commands.registerCommand("wire.compileAndReload", wireCommand(compileAndReload))
  );
}

export function deactivate(): void {}
