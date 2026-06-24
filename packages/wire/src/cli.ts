import { runCLI } from "toolcraft/cli";

import type { WireRoot } from "./adapters/root.js";

export type WireRootFactory = (currentDirectory: string) => WireRoot;

let brokenPipeHandlerInstalled = false;

function installBrokenPipeHandler(): void {
  if (brokenPipeHandlerInstalled) return;
  const handler = (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  };
  process.stdout.on("error", handler);
  process.stderr.on("error", handler);
  brokenPipeHandlerInstalled = true;
}

function normalizeDefaultCommandArgv(argv: readonly string[]): readonly string[] {
  const aliases = normalizeFlagAliases(argv);
  const versioned = normalizeVersionCommandArgv(aliases);
  const helped = normalizeHelpCommandArgv(versioned);
  const helpVersioned = normalizeVersionCommandArgv(helped);
  const debugTargeted = normalizeLeadingDebugTargetArgv(helpVersioned);
  const normalized = normalizeBareDebugArgv(debugTargeted);
  const words = positionalWords(normalized);
  if (normalized.length === 2) return [normalized[0]!, normalized[1]!, "--help"];
  if (hasHelp(normalized) && words !== null && words.length > 0 && isSourceUrl(words[0]!)) return [normalized[0]!, normalized[1]!, "attach", "--help"];
  if (!hasHelpOrVersion(normalized) && !hasInvalidGlobalControl(normalized) && words?.length === 0) return [...normalized, "--help"];
  if (!hasHelpOrVersion(normalized) && !hasInvalidGlobalControl(normalized) && words?.length === 1 && authServices.has(words[0]!)) return [...normalized, "--help"];
  return normalized;
}

function normalizeLeadingDebugTargetArgv(argv: readonly string[]): readonly string[] {
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") return argv;
    if (arg === "--output") {
      index += 1;
    } else if (arg === "--debug") {
      const value = argv[index + 1];
      if (value !== undefined && isDebugTarget(value)) return [...argv.slice(0, index), value, ...argv.slice(index + 2), arg];
      return argv;
    } else if (arg.startsWith("--debug=")) {
      const value = arg.slice("--debug=".length);
      if (isDebugTarget(value)) return [...argv.slice(0, index), value, ...argv.slice(index + 1), "--debug"];
      return argv;
    } else if (arg.startsWith("--output=") || arg.startsWith("-")) {
      continue;
    } else {
      return argv;
    }
  }
  return argv;
}

function normalizeVersionCommandArgv(argv: readonly string[]): readonly string[] {
  const words = positionalWords(argv);
  if (words === null || words[0] !== "version") return argv;
  const index = argv.indexOf("version", 2);
  const separatorIndex = argv.indexOf("--", 2);
  if (separatorIndex !== -1 && index > separatorIndex) return argv;
  return [...argv.slice(0, index), ...argv.slice(index + 1), "--version"];
}

function normalizeHelpCommandArgv(argv: readonly string[]): readonly string[] {
  const separatorIndex = argv.indexOf("--", 2);
  const end = separatorIndex === -1 ? argv.length : separatorIndex;
  const helpIndex = argv.slice(2, end).indexOf("help");
  if (helpIndex === -1) return argv;
  const index = helpIndex + 2;
  return [...argv.slice(0, index), ...argv.slice(index + 1), "--help"];
}

function normalizeFlagAliases(argv: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (index >= 2 && arg === "--") {
      normalized.push(...argv.slice(index));
      break;
    }
    normalized.push(...(arg === "--json" ? ["--output", "json"] : arg === "--markdown" ? ["--output", "markdown"] : arg === "--md" ? ["--output", "md"] : arg === "-V" ? ["--version"] : [arg]));
  }
  return normalized;
}

function normalizeBareDebugArgv(argv: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (index >= 2 && arg === "--") {
      normalized.push(...argv.slice(index));
      break;
    }
    const value = argv[index + 1];
    const priorWords = positionalWords(normalized);
    if (index >= 2 && arg === "--debug" && value !== undefined && !value.startsWith("-") && !debugModeNames.has(value) && (isDebugTarget(value) || (priorWords !== null && priorWords.length > 0))) {
      normalized.push(value, arg);
      index += 1;
    } else {
      normalized.push(arg);
    }
  }
  return normalized;
}

const fixedCommandPositionals = Object.freeze({
  attach: Object.freeze({ expected: 1, name: "url" }),
  detach: Object.freeze({ expected: 1, name: "resource" }),
  download: Object.freeze({ expected: 1, name: "url" }),
  init: Object.freeze({ expected: 0, name: "" }),
  open: Object.freeze({ expected: 1, name: "resource" }),
  preview: Object.freeze({ expected: 1, name: "url" }),
  "switch-db": Object.freeze({ expected: 0, name: "" }),
  sync: Object.freeze({ expected: 1, name: "resource" }),
  "sync-all": Object.freeze({ expected: 0, name: "" }),
  watch: Object.freeze({ expected: 1, name: "file" }),
});
const authServices = new Set(["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"]);
const authCommands = new Set(["login", "logout", "status"]);
const removedCommandNames = Object.freeze({
  auth: "Use `wire <service> status`, `wire <service> login`, or `wire <service> logout`.",
  create: "Use `wire attach <url>` or `wire <url>`.",
  fetch: "Use `wire download <url>`.",
  link: "Use `wire attach <url>` or `wire <url>`.",
  unlink: "Use `wire detach <resource>`.",
  view: "Use `wire preview <url>`.",
});
const outputFormatNames = new Set(["rich", "md", "markdown", "json"]);
const outputFormatList = "md, markdown, json, rich";
const debugModeNames = new Set(["raw"]);
const backendNames = new Set(["sqlite", "files"]);
const backendList = "sqlite, files";

function isSourceUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
}

function isSourceLikeWithoutScheme(value: string): boolean {
  return /^(docs\.google\.com|mail\.google\.com|app\.asana\.com|chatgpt\.com|chat\.openai\.com|hub\.zoom\.us|www\.notion\.so|notion\.so|app\.notion\.com|[^/\s]+\.notion\.site|[^/\s]+\.slack\.com)(?:[/?:#]|$)/.test(value);
}

function expectedSourceMessage(prefix: string, value: string): string {
  return isSourceLikeWithoutScheme(value) ? `${prefix}: ${value}\nAdd \`https://\` and retry.` : `${prefix}: ${value}`;
}

function isDebugTarget(value: string): boolean {
  return isSourceUrl(value) || value in fixedCommandPositionals || authServices.has(value) || value in removedCommandNames;
}

function hasHelpOrVersion(argv: readonly string[]): boolean {
  return argsBeforeSeparator(argv).some((arg) => arg === "--help" || arg === "-h" || arg === "--version" || arg === "-V");
}

function hasHelp(argv: readonly string[]): boolean {
  return argsBeforeSeparator(argv).some((arg) => arg === "--help" || arg === "-h");
}

function hasVersion(argv: readonly string[]): boolean {
  return argsBeforeSeparator(argv).some((arg) => arg === "--version" || arg === "-V");
}

function hasRootSeparator(argv: readonly string[]): boolean {
  return rootSeparatorIndex(argv) !== -1;
}

function rootSeparatorIndex(argv: readonly string[]): number {
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") return index;
    if (arg === "--output" || (arg === "--debug" && argv[index + 1] !== undefined && debugModeNames.has(argv[index + 1]!))) index += 1;
    else if (arg.startsWith("--output=") || (arg.startsWith("--debug=") && debugModeNames.has(arg.slice("--debug=".length)))) continue;
    else return -1;
  }
  return -1;
}

function argsBeforeSeparator(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  const separator = args.indexOf("--");
  return separator === -1 ? args : args.slice(0, separator);
}

function lastValidOutputFormat(argv: readonly string[]): string | undefined {
  return outputFormats(argv).filter((format) => outputFormatNames.has(format)).at(-1);
}

function wantsJsonOutput(argv: readonly string[]): boolean {
  return lastValidOutputFormat(argv) === "json";
}

function cliErrorText(message: string, usage?: string): string {
  const lines = message.split(/\r\n|\n|\r/).map((line) => line.replace(/[\t\r\n]+/g, " ").trim());
  const usageLine = usage === undefined ? "" : `\u2502  Run \`${usage}\` for usage.\n`;
  return `\u2502\n\u25a0  ${lines[0]}\n${lines.slice(1).map((line) => `\u2502  ${line}`).join("\n")}${lines.length > 1 ? "\n" : ""}${usageLine}`;
}

function cliValue(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

function renderCliError(argv: readonly string[], message: string, usage: string, displayMessage = message): void {
  if (wantsJsonOutput(argv)) process.stdout.write(`${JSON.stringify({ error: { message, usage } }, null, 2)}\n`);
  else process.stdout.write(cliErrorText(displayMessage, usage));
  process.exitCode = 1;
}

function positionalWords(argv: readonly string[]): readonly string[] | null {
  const words: string[] = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") {
      words.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--help" || arg === "-h" || arg === "--version" || arg === "-V") {
      continue;
    } else if (arg === "--output" || (arg === "--backend" && words[0] === "init") || (arg === "--debug" && argv[index + 1] !== undefined && debugModeNames.has(argv[index + 1]!))) {
      index += 1;
    } else if (arg === "--debug" || (arg === "--paste" && authServices.has(words[0]!) && words[1] === "login") || arg.startsWith("--debug=") || arg.startsWith("--output=") || (arg.startsWith("--backend=") && words[0] === "init")) {
      continue;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      words.push(arg);
    }
  }
  return words;
}

function excessPositionals(argv: readonly string[]): Readonly<{ commandPath: string; expected: number; received: number }> | null {
  if (hasHelpOrVersion(argv)) return null;
  const words = positionalWords(argv);
  if (words === null || words.length === 0) return null;
  const command = words[0]!;
  if (command in fixedCommandPositionals) return Object.freeze({ commandPath: command, expected: fixedCommandPositionals[command as keyof typeof fixedCommandPositionals].expected, received: words.length - 1 });
  if (authServices.has(command)) {
    const authCommand = words[1];
    if (authCommand === undefined || !authCommands.has(authCommand)) return null;
    return Object.freeze({ commandPath: `${command} ${authCommand}`, expected: 0, received: words.length - 2 });
  }
  if (isSourceUrl(command)) return Object.freeze({ commandPath: "attach", expected: 1, received: words.length });
  return null;
}

function missingPositionals(argv: readonly string[]): Readonly<{ commandPath: string; name: string }> | null {
  if (hasHelpOrVersion(argv)) return null;
  const words = positionalWords(argv);
  if (words === null || words.length === 0) return null;
  const command = words[0]!;
  if (!(command in fixedCommandPositionals)) return null;
  const positional = fixedCommandPositionals[command as keyof typeof fixedCommandPositionals];
  if (words.length - 1 >= positional.expected || positional.expected === 0) return null;
  return Object.freeze({ commandPath: command, name: positional.name });
}

function renderMissingPositionals(argv: readonly string[]): boolean {
  const missing = missingPositionals(argv);
  if (missing === null) return false;
  renderCliError(argv, `Missing required argument: ${missing.name}`, `wire ${missing.commandPath} --help`);
  return true;
}

function renderExcessPositionals(argv: readonly string[]): boolean {
  const excess = excessPositionals(argv);
  if (excess === null || excess.received <= excess.expected) return false;
  const argument = excess.expected === 1 ? "argument" : "arguments";
  const expected = excess.expected === 0 ? "none" : `${excess.expected} ${argument}`;
  renderCliError(argv, `Too many arguments: expected ${expected}, got ${excess.received}.`, `wire ${excess.commandPath} --help`);
  return true;
}

function renderRemovedCommand(argv: readonly string[]): boolean {
  if (hasRootSeparator(argv)) return false;
  const words = positionalWords(argv);
  if (words === null || words.length === 0) return false;
  const replacement = removedCommandNames[words[0]! as keyof typeof removedCommandNames];
  if (replacement === undefined) return false;
  renderCliError(argv, `Unknown command: ${words[0]}\n${replacement}`, "wire --help", `Unknown command: ${cliValue(words[0]!)}\n${replacement}`);
  return true;
}

function renderUnknownAuthCommand(argv: readonly string[]): boolean {
  if (hasRootSeparator(argv)) return false;
  const words = positionalWords(argv);
  if (words === null || words.length < 2 || !authServices.has(words[0]!) || authCommands.has(words[1]!)) return false;
  renderCliError(argv, `Unknown command: ${words[1]}`, `wire ${words[0]} --help`, `Unknown command: ${cliValue(words[1]!)}`);
  return true;
}

function authCommandAfterServiceSeparator(argv: readonly string[]): Readonly<{ service: string; command: string }> | null {
  const words: string[] = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") {
      const command = argv[index + 1];
      return words.length === 1 && authServices.has(words[0]!) && command !== undefined && authCommands.has(command) ? Object.freeze({ service: words[0]!, command }) : null;
    }
    if (arg === "--output" || (arg === "--debug" && argv[index + 1] !== undefined && debugModeNames.has(argv[index + 1]!))) index += 1;
    else if (arg.startsWith("--output=") || arg.startsWith("--debug=") || arg.startsWith("-")) continue;
    else words.push(arg);
  }
  return null;
}

function renderAuthCommandAfterServiceSeparator(argv: readonly string[]): boolean {
  const command = authCommandAfterServiceSeparator(argv);
  if (command === null) return false;
  renderCliError(argv, `Unknown command: ${command.command}`, `wire ${command.service} --help`, `Unknown command: ${cliValue(command.command)}`);
  return true;
}

function renderInvalidSourceUrl(argv: readonly string[]): boolean {
  if (hasRootSeparator(argv)) return false;
  const words = positionalWords(argv);
  if (words === null || words.length < 2 || (words[0] !== "attach" && words[0] !== "download" && words[0] !== "preview") || isSourceUrl(words[1]!)) return false;
  renderCliError(argv, expectedSourceMessage("Expected source URL", words[1]!), `wire ${words[0]} --help`, expectedSourceMessage("Expected source URL", cliValue(words[1]!)));
  return true;
}

function renderSchemelessResourceUrl(argv: readonly string[]): boolean {
  if (hasRootSeparator(argv)) return false;
  const words = positionalWords(argv);
  if (words === null || words.length < 2 || (words[0] !== "sync" && words[0] !== "detach" && words[0] !== "open") || !isSourceLikeWithoutScheme(words[1]!)) return false;
  renderCliError(argv, `Expected resource URL or Markdown path: ${words[1]}\nAdd \`https://\` and retry.`, `wire ${words[0]} --help`, `Expected resource URL or Markdown path: ${cliValue(words[1]!)}\nAdd \`https://\` and retry.`);
  return true;
}

function renderControlLikeResourceAfterSeparator(argv: readonly string[]): boolean {
  const words = positionalWords(argv);
  if (words === null || words.length < 2 || (words[0] !== "attach" && words[0] !== "download" && words[0] !== "preview" && words[0] !== "sync" && words[0] !== "detach" && words[0] !== "open" && words[0] !== "watch")) return false;
  const separator = argv.indexOf("--", 2);
  if (separator <= 2) return false;
  const value = argv[separator + 1];
  if (value === undefined || !value.startsWith("-") || words.length - 1 !== fixedCommandPositionals[words[0]! as keyof typeof fixedCommandPositionals].expected) return false;
  const label = words[0] === "watch" ? "Markdown path" : words[0] === "attach" || words[0] === "download" || words[0] === "preview" ? "source URL" : "resource URL or Markdown path";
  renderCliError(argv, `Expected ${label}: ${value}`, `wire ${words[0]} --help`, `Expected ${label}: ${cliValue(value)}`);
  return true;
}

function looksLikePathInput(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /\.md$/i.test(value);
}

function renderUnknownRootInput(argv: readonly string[]): boolean {
  const words = positionalWords(argv);
  if (words === null || words.length === 0) return false;
  const command = words[0]!;
  if ((!hasRootSeparator(argv) && (command in fixedCommandPositionals || authServices.has(command) || command in removedCommandNames)) || isSourceUrl(command)) return false;
  if (isSourceLikeWithoutScheme(command)) {
    renderCliError(argv, expectedSourceMessage("Expected source URL or command", command), "wire --help", expectedSourceMessage("Expected source URL or command", cliValue(command)));
    return true;
  }
  if (looksLikePathInput(command)) {
    renderCliError(argv, `Expected source URL or command: ${command}\nUse \`wire sync ${command}\` for registered Markdown paths.`, "wire --help", `Expected source URL or command: ${cliValue(command)}\nUse \`wire sync ${cliValue(command)}\` for registered Markdown paths.`);
    return true;
  }
  renderCliError(argv, `Expected source URL or command: ${command}`, "wire --help", `Expected source URL or command: ${cliValue(command)}`);
  return true;
}

function outputFormats(argv: readonly string[]): readonly string[] {
  const formats: string[] = [];
  const args = argsBeforeSeparator(argv);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--output") {
      const value = args[index + 1];
      formats.push(value === undefined || value.startsWith("-") ? "" : value);
      index += 1;
    } else if (arg.startsWith("--output=")) {
      formats.push(arg.slice("--output=".length));
    }
  }
  return formats;
}

function outputHelpCommandPath(argv: readonly string[]): string | null {
  const words = positionalWords(argv);
  if (words === null || words.length === 0) return null;
  if (isSourceUrl(words[0]!)) return "attach";
  if (authServices.has(words[0]!)) return words[1] !== undefined && authCommands.has(words[1]!) ? `${words[0]} ${words[1]}` : words[0]!;
  if (words[0]! in fixedCommandPositionals) return words[0]!;
  return null;
}

function renderInvalidOutputFormat(argv: readonly string[]): boolean {
  const format = outputFormats(argv).find((value) => value === "" || !outputFormatNames.has(value));
  if (format === undefined) return false;
  const commandPath = outputHelpCommandPath(argv);
  const usage = commandPath === null ? "wire --help" : `wire ${commandPath} --help`;
  if (format === "") {
    renderCliError(argv, `Missing value for "--output"\nExpected one of: ${outputFormatList}`, usage);
    return true;
  }
  renderCliError(argv, `Invalid value for "--output"\nExpected one of: ${outputFormatList}, got "${format}"`, usage, `Invalid value for "--output"\nExpected one of: ${outputFormatList}, got "${cliValue(format)}"`);
  return true;
}

function debugModes(argv: readonly string[]): readonly string[] {
  const modes: string[] = [];
  const args = argsBeforeSeparator(argv);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--debug") {
      const value = args[index + 1];
      if (value !== undefined && debugModeNames.has(value)) {
        modes.push(value);
        index += 1;
      } else if (value !== undefined && !value.startsWith("-") && !isDebugTarget(value)) modes.push(value);
    } else if (arg.startsWith("--debug=")) modes.push(arg.slice("--debug=".length));
  }
  return modes;
}

function renderInvalidDebugMode(argv: readonly string[]): boolean {
  const mode = debugModes(argv).find((value) => value === "" || !debugModeNames.has(value));
  if (mode === undefined) return false;
  const commandPath = outputHelpCommandPath(argv);
  const usage = commandPath === null ? "wire --help" : `wire ${commandPath} --help`;
  if (mode === "") {
    renderCliError(argv, `Missing value for "--debug"\nExpected one of: raw`, usage);
    return true;
  }
  renderCliError(argv, `Invalid value for "--debug"\nExpected one of: raw, got "${mode}"`, usage, `Invalid value for "--debug"\nExpected one of: raw, got "${cliValue(mode)}"`);
  return true;
}

function initBackendValues(argv: readonly string[]): readonly string[] {
  const values: string[] = [];
  const words = positionalWords(argv);
  if (words === null || words[0] !== "init") return values;
  const args = argsBeforeSeparator(argv);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--backend") {
      const value = args[index + 1];
      values.push(value === undefined || value.startsWith("-") ? "" : value);
      index += 1;
    } else if (arg.startsWith("--backend=")) values.push(arg.slice("--backend=".length));
  }
  return values;
}

function renderInvalidInitBackend(argv: readonly string[]): boolean {
  if (hasHelpOrVersion(argv)) return false;
  const backend = initBackendValues(argv).find((value) => value === "" || !backendNames.has(value));
  if (backend === undefined) return false;
  if (backend === "") {
    renderCliError(argv, `Missing value for "--backend"\nExpected one of: ${backendList}`, "wire init --help");
    return true;
  }
  renderCliError(argv, `Invalid value for "--backend"\nExpected one of: ${backendList}, got "${backend}"`, "wire init --help", `Invalid value for "--backend"\nExpected one of: ${backendList}, got "${cliValue(backend)}"`);
  return true;
}

function hasInvalidGlobalControl(argv: readonly string[]): boolean {
  return outputFormats(argv).some((format) => format === "" || !outputFormatNames.has(format)) || debugModes(argv).some((mode) => mode === "" || !debugModeNames.has(mode));
}


export async function runWireCli(root: WireRoot | WireRootFactory, argv: readonly string[], currentDirectory: string): Promise<void> {
  installBrokenPipeHandler();
  const normalized = normalizeDefaultCommandArgv(argv);
  const version = hasVersion(normalized);
  if (!version && renderAuthCommandAfterServiceSeparator(normalized)) {
    return;
  }
  if (!version && renderUnknownAuthCommand(normalized)) {
    return;
  }
  if (!version && renderRemovedCommand(normalized)) {
    return;
  }
  if (!version && renderInvalidDebugMode(normalized)) {
    return;
  }
  if (!version && renderInvalidOutputFormat(normalized)) {
    return;
  }
  if (!version && renderInvalidInitBackend(normalized)) {
    return;
  }
  if (!version && renderInvalidSourceUrl(normalized)) {
    return;
  }
  if (!version && renderSchemelessResourceUrl(normalized)) {
    return;
  }
  if (!version && renderControlLikeResourceAfterSeparator(normalized)) {
    return;
  }
  if (!version && renderUnknownRootInput(normalized)) {
    return;
  }
  if (!version && renderMissingPositionals(normalized)) {
    return;
  }
  if (!version && renderExcessPositionals(normalized)) {
    return;
  }
  await runCLI(typeof root === "function" ? root(currentDirectory) : root, { version: "0.1.0", rootUsageName: "wire", presets: false, approvals: false, controls: { output: true, debug: true }, argv: normalized });
}
