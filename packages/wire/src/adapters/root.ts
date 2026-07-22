import { UserError, defineCommand, defineGroup, S, type Group } from "toolcraft";

import { defaultWireBackend, registryPathForBackend, type FetchedDocument, type InitializedWire, type Resource, type SwitchedWireBackend, type Wire, type WireBackend, type WireResult, type WireWatchSession } from "wire-core";
import type { Auth, AuthResult, AuthService } from "../auth.js";

export type WireRoot = Group;
export type TextInputReader = () => Promise<string>;
export type WireRootOptions = Readonly<{ allowPaste: boolean }>;

const authServices = ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"] as const;
const removedCliCommandNames = Object.freeze({
  create: "Use `wire attach <url>` or `wire <url>`.",
  fetch: "Use `wire download <url>`.",
  link: "Use `wire attach <url>` or `wire <url>`.",
  unlink: "Use `wire detach <resource>`.",
  view: "Use `wire preview <url>`.",
});

type WireRenderer<T> = Readonly<{
  json(value: T): unknown;
  markdown(value: T): string;
  rich(value: T, primitives: any): void;
}>;

type WirePresentation = Readonly<{
  init: WireRenderer<InitializedWire>;
  switchBackend: WireRenderer<SwitchedWireBackend>;
  attach: WireRenderer<WireResult>;
  view: WireRenderer<FetchedDocument>;
  sync: WireRenderer<WireResult>;
  download: WireRenderer<WireResult>;
  detach: WireRenderer<WireResult>;
  watch: WireRenderer<WireWatchSession>;
  open: WireRenderer<Resource>;
  syncAll: WireRenderer<readonly WireResult[]>;
  authStatus: WireRenderer<AuthResult>;
  authLogout: WireRenderer<{ readonly service: AuthService; readonly deleted: true }>;
}>;

type WireResultJson = Readonly<{
  resource_id: string;
  title: string;
  action: WireResult["summary"]["action"];
  added: number;
  modified: number;
  removed: number;
  remote: string;
  local: string;
  path: string;
  error?: string;
}>;

type ResourceJson = Readonly<{
  resource_id: string;
  title: string;
  type: string;
  remote: string;
  local: string;
  path: string;
  synced_at: string;
}>;

function wireTitle(resource: Resource): string {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "title")!.value as string;
}

function wireSyncedAt(resource: Resource): string {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "synced_at")!.value as string;
}

function primaryFilesystemLink(resource: Resource) {
  return resource.filesystem_links.find((link) => link.role === "primary")!;
}

function lineText(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

function formatOpenedResource(resource: Resource): string {
  return [
    `opened  ${lineText(wireTitle(resource))}`,
    `remote: ${lineText(resource.urls[0]!)}`,
    `local:  ${lineText(primaryFilesystemLink(resource).path)}`,
    `id:     ${lineText(resource.id)}`,
  ].join("\n");
}

function resourceJson(resource: Resource): ResourceJson {
  const path = primaryFilesystemLink(resource).path;
  return { resource_id: resource.id, title: wireTitle(resource), type: resource.type, remote: resource.urls[0]!, local: path, path, synced_at: wireSyncedAt(resource) };
}

function render<T>(markdown: (value: T) => string) {
  return {
    json: (value: T) => value,
    markdown,
    rich: (value: T, primitives: any) => primitives.logger.message(markdown(value), ""),
  };
}

function richText(message: string, primitives: any): void {
  primitives.logger.message(message, "");
}

function formatWireCounts(result: WireResult): string {
  return `+${result.summary.added} ~${result.summary.modified} -${result.summary.removed}`;
}

function formatWireCountsRich(result: WireResult, primitives: any): string {
  const theme = primitives.getTheme();
  return [
    theme.success(`+${result.summary.added}`),
    theme.warning(`~${result.summary.modified}`),
    theme.error(`-${result.summary.removed}`),
  ].join(" ");
}

function formatWireResult(result: WireResult): string {
  const local = lineText(primaryFilesystemLink(result.resource).path);
  const remote = lineText(result.summary.remote);
  const titleText = lineText(wireTitle(result.resource));
  if (result.summary.action === "failed") return [`failed  ${titleText}`, `local:  ${local}`, formatMultilineField("error", result.summary.error!)].join("\n");
  const changed = result.summary.action !== "detached" && (result.summary.added !== 0 || result.summary.modified !== 0 || result.summary.removed !== 0);
  const title = changed ? `${result.summary.action}  ${formatWireCounts(result)}  ${titleText}` : `${result.summary.action}  ${titleText}`;
  return [title, ...(result.summary.action === "uploaded" ? [`remote: ${remote}`] : []), `local:  ${local}`].join("\n");
}

function formatWireResultRich(result: WireResult, primitives: any): string {
  const local = lineText(primaryFilesystemLink(result.resource).path);
  const remote = lineText(result.summary.remote);
  const titleText = lineText(wireTitle(result.resource));
  if (result.summary.action === "failed") return [`failed  ${titleText}`, `local:  ${local}`, formatMultilineField("error", result.summary.error!)].join("\n");
  const changed = result.summary.action !== "detached" && (result.summary.added !== 0 || result.summary.modified !== 0 || result.summary.removed !== 0);
  const title = changed ? `${result.summary.action}  ${formatWireCountsRich(result, primitives)}  ${titleText}` : `${result.summary.action}  ${titleText}`;
  return [title, ...(result.summary.action === "uploaded" ? [`remote: ${remote}`] : []), `local:  ${local}`].join("\n");
}

function formatMultilineField(label: string, value: string): string {
  const lines = value.split(/\r\n|\n|\r/).map(lineText);
  return [`${label}:  ${lines[0]!}`, ...lines.slice(1).map((line) => `${" ".repeat(label.length + 3)}${line}`)].join("\n");
}

function wireResultJson(result: WireResult): WireResultJson {
  const local = primaryFilesystemLink(result.resource).path;
  return {
    resource_id: result.resource.id,
    title: wireTitle(result.resource),
    action: result.summary.action,
    added: result.summary.added,
    modified: result.summary.modified,
    removed: result.summary.removed,
    remote: result.summary.remote,
    local,
    path: result.path,
    ...(result.summary.error === undefined ? {} : { error: result.summary.error }),
  };
}

function changedWireResult(result: WireResult): boolean {
  return result.summary.action !== "synced" || result.summary.added !== 0 || result.summary.modified !== 0 || result.summary.removed !== 0;
}

function formatWireResults(results: readonly WireResult[]): string {
  if (results.length === 0) return "no resources";
  const changed = results.filter(changedWireResult);
  const checked = `checked: ${results.length}`;
  return changed.length === 0 ? `no changes\n${checked}` : `${changed.map(formatWireResult).join("\n\n")}\n\n${checked}`;
}

function formatWireResultsRich(results: readonly WireResult[], primitives: any): string {
  if (results.length === 0) return "no resources";
  const changed = results.filter(changedWireResult);
  const checked = `checked: ${results.length}`;
  return changed.length === 0 ? `no changes\n${checked}` : `${changed.map((result) => formatWireResultRich(result, primitives)).join("\n\n")}\n\n${checked}`;
}

function formatWatchSession(value: WireWatchSession): string {
  return [`watching ${lineText(wireTitle(value.resource))}`, `local:  ${lineText(primaryFilesystemLink(value.resource).path)}`, `mode:   ${lineText(value.mode)}`, `timing: debounce ${value.debounceMs}ms, poll ${value.pollMs}ms`, "stop:   Ctrl-C"].join("\n");
}

function formatSwitchedBackend(value: SwitchedWireBackend): string {
  return [`registry switched`, `backend:   ${lineText(value.from)} -> ${lineText(value.to)}`, `resources: ${value.resources}`, `from:      ${lineText(value.fromPath)}`, `to:        ${lineText(value.toPath)}`].join("\n");
}

function formatInitializedWire(value: InitializedWire): string {
  const prefix = `${value.root}/`;
  const registry = value.path.startsWith(prefix) ? value.path.slice(prefix.length) : value.path;
  const lines = [`${value.created ? "workspace created" : "workspace ready"}`, `root:    ${lineText(value.root)}`, `backend: ${lineText(value.backend)}`, `registry: ${lineText(registry)}`];
  if (value.created) lines.push("attach:  wire <url>");
  return lines.join("\n");
}

function watchSessionJson(value: WireWatchSession) {
  value.close();
  throw new UserError("wire watch --json is not supported. Use markdown output for watch.");
}

function wireUserErrorMessage(message: string): boolean {
  return /^Unsupported source URL: /.test(message)
    || /^Wire workspace already initialized with (sqlite|files) registry at .+\. Existing registries are not overwritten\.$/.test(message)
    || /^Resource path is not registered: /.test(message)
    || /^Resource (path |identifier |URL )?not found: /.test(message)
    || /^Ambiguous resource path /.test(message)
    || /^Login not saved$/.test(message)
    || /authentication (is missing|is missing or expired|failed|expired).*Run `wire (asana|chatgpt|gmail|google-docs|notion|slack|zoom) login`/i.test(message)
    || /^Asana API /.test(message)
    || /^(GET|POST|PUT|DELETE) \/.* failed: \d+ /.test(message)
    || /^(Invalid Asana project heading|Asana section appears|Asana milestone appears|Asana task appears|Asana subtask appears|Unsupported Asana Markdown|Duplicate Asana identity|Missing Asana project heading|Asana project identity changed|Unknown Asana identity|Conflicting Asana edits)/.test(message)
    || /^ChatGPT conversation download failed\. Run `wire chatgpt login`\./.test(message)
    || /^Gmail API .+ failed: HTTP \d+ /.test(message)
    || /^Slack API [\w.]+ failed: /.test(message)
    || /^Zoom Hub (.+ failed: HTTP \d+|file .+ was not returned by batch_get)/.test(message)
    || /^(Markdown document requires a first heading|Markdown and Notion changed since last sync|lossless Markdown headings deeper than level 3 are not supported)$/.test(message)
    || /^Indented Notion Markdown block has no parent at indent \d+$/.test(message)
    || /^POST [A-Za-z0-9]+ failed: \d+ /.test(message)
    || /^Google (Docs|Sheets|Slides) changed remotely and locally\./.test(message)
    || /^Google Docs local edit cannot be mapped to the live document text$/.test(message)
    || /^Google Docs sync cannot upload formatting-only Markdown edits$/.test(message)
    || /^Google Docs sync cannot preserve formatting in edited text$/.test(message)
    || /^Google Slides sync is download-only\./.test(message)
    || /^Google Forms sync is download-only\./.test(message)
    || /^Google Forms API is disabled\. Enable it at /.test(message)
    || /^Google Forms API token is missing required scopes\./.test(message)
    || /^Google Forms API authentication is missing or expired\./.test(message)
    || /^Google Forms API .+ failed: HTTP \d+/.test(message)
    || /^Google (Docs|Sheets) editor did not include save metadata$/.test(message)
    || /^Google (Docs Markdown|Sheets CSV|Slides PPTX) export (did not include a filename|failed: HTTP \d+)$/.test(message)
    || /^Google (Docs|Sheets) save (failed: |verification failed$)/.test(message)
    || /^Google sync base must /.test(message)
    || /^Google Sheets sync base /.test(message)
    || /^Google Sheets sync cannot upload formula-like cell text at row \d+, column \d+\nPrefix it with an apostrophe or rewrite it as plain text before syncing\.$/.test(message)
    || /^Google Sheets sync requires fenced CSV to end with ```$/.test(message)
    || /^Google Sheets sync requires a Markdown table/.test(message)
    || /^Google Sheets sync requires every Markdown table row to have the same number of cells$/.test(message)
    || /^Google Sheets sync requires every Markdown table row to have \d+ cells: line \d+ has \d+$/.test(message);
}

function wireUserErrorDisplayMessage(message: string): string {
  const unsupportedSource = /^Unsupported source URL: ([\s\S]+)$/.exec(message);
  if (unsupportedSource !== null) return `unsupported source\nurl: ${lineText(unsupportedSource[1]!)}\nsupported: Asana, ChatGPT, Gmail, Google Docs/Sheets/Slides/Forms, Notion, Slack, Zoom`;
  const existingWorkspace = /^Wire workspace already initialized with (sqlite|files) registry at ([\s\S]+)\. Existing registries are not overwritten\.$/.exec(message);
  if (existingWorkspace !== null) return `workspace already initialized\nbackend: ${existingWorkspace[1]!}\nregistry: ${lineText(existingWorkspace[2]!)}\nkept: existing registry`;
  const authentication = /authentication (is missing or expired|is missing|failed|expired).*Run `wire (asana|chatgpt|gmail|google-docs|notion|slack|zoom) login`/i.exec(message);
  if (authentication !== null) return `login required\nservice: ${serviceTitle(authentication[2] as AuthService)}\nrun: wire ${authentication[2]} login`;
  const asanaApi = /^Asana API ([^\s]+) failed: HTTP (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (asanaApi !== null) return `api failed\nservice: Asana\nrequest: ${lineText(asanaApi[1]!)}\nstatus: HTTP ${asanaApi[2]!}${asanaApi[3] === undefined ? "" : `\ndetail: ${lineText(asanaApi[3]!)}`}`;
  const httpApi = /^(GET|POST|PUT|DELETE) (\/[^\s]*) failed: (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (httpApi !== null) return `api failed\nservice: Asana\nrequest: ${httpApi[1]!} ${lineText(httpApi[2]!)}\nstatus: HTTP ${httpApi[3]!}${httpApi[4] === undefined ? "" : `\ndetail: ${lineText(httpApi[4]!)}`}`;
  const gmailApi = /^Gmail API ([\s\S]+?) failed: HTTP (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (gmailApi !== null) return `api failed\nservice: Gmail\noperation: ${lineText(gmailApi[1]!)}\nstatus: HTTP ${gmailApi[2]!}${gmailApi[3] === undefined ? "" : `\ndetail: ${lineText(gmailApi[3]!)}`}`;
  const slackApi = /^Slack API ([\w.]+) failed: ([\s\S]+)$/.exec(message);
  if (slackApi !== null) return `api failed\nservice: Slack\nmethod: ${lineText(slackApi[1]!)}\ndetail: ${lineText(slackApi[2]!)}`;
  const zoomApi = /^Zoom Hub ([\s\S]+?) failed: HTTP (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (zoomApi !== null) return `api failed\nservice: Zoom\noperation: ${lineText(zoomApi[1]!)}\nstatus: HTTP ${zoomApi[2]!}${zoomApi[3] === undefined ? "" : `\ndetail: ${lineText(zoomApi[3]!)}`}`;
  const zoomMissingFile = /^Zoom Hub file ([\s\S]+) was not returned by batch_get$/.exec(message);
  if (zoomMissingFile !== null) return `file missing\nservice: Zoom\nfile: ${lineText(zoomMissingFile[1]!)}\noperation: batch_get`;
  const notionApi = /^POST ([A-Za-z0-9]+) failed: (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (notionApi !== null) return `api failed\nservice: Notion\nrequest: POST ${lineText(notionApi[1]!)}\nstatus: HTTP ${notionApi[2]!}${notionApi[3] === undefined ? "" : `\ndetail: ${lineText(notionApi[3]!)}`}`;
  const unsupportedAsanaMarkdown = /^Unsupported Asana Markdown at line (\d+): ([\s\S]+)$/.exec(message);
  if (unsupportedAsanaMarkdown !== null) return `local markdown invalid\nservice: Asana\nline: ${unsupportedAsanaMarkdown[1]!}\ndetail: ${lineText(unsupportedAsanaMarkdown[2]!)}`;
  const unknownAsanaIdentity = /^Unknown Asana identity ([^\s.]+)\. New entries must not include a URL\.$/.exec(message);
  if (unknownAsanaIdentity !== null) return `unknown identity\nservice: Asana\nidentity: ${lineText(unknownAsanaIdentity[1]!)}\nresolve: remove URL from new entries`;
  const conflictingAsanaEdits = /^Conflicting Asana edits: ([\s\S]+)$/.exec(message);
  if (conflictingAsanaEdits !== null) return `sync conflict\nservice: Asana\nfield: ${lineText(conflictingAsanaEdits[1]!)}\nresolve: edit Asana or local Markdown, then sync again`;
  const notionMissingHeading = /^Markdown document requires a first heading$/.exec(message);
  if (notionMissingHeading !== null) return "local markdown invalid\nservice: Notion\ndetail: missing first heading";
  const notionConflict = /^Markdown and Notion changed since last sync$/.exec(message);
  if (notionConflict !== null) return "sync conflict\nservice: Notion\nresolve: edit Notion or local Markdown, then sync again";
  const notionHeadingDepth = /^lossless Markdown headings deeper than level 3 are not supported$/.exec(message);
  if (notionHeadingDepth !== null) return "local markdown invalid\nservice: Notion\ndetail: headings deeper than level 3 are not supported";
  const notionIndentedBlock = /^Indented Notion Markdown block has no parent at indent (\d+)$/.exec(message);
  if (notionIndentedBlock !== null) return `local markdown invalid\nservice: Notion\nindent: ${notionIndentedBlock[1]!}\ndetail: indented block has no parent`;
  const chatgptDownload = /^ChatGPT conversation download failed\. Run `wire chatgpt login`\.([\s\S]*)$/.exec(message);
  if (chatgptDownload !== null) return `download failed\nservice: ChatGPT\nlogin: wire chatgpt login\ndetail: ${lineText(chatgptDownload[1]!)}`;
  const googleExportMissingFilename = /^Google (Docs Markdown|Sheets CSV|Slides PPTX) export did not include a filename$/.exec(message);
  if (googleExportMissingFilename !== null) return `export failed\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleExportMissingFilename[1]!}\ndetail: missing filename`;
  const googleExportHttp = /^Google (Docs Markdown|Sheets CSV|Slides PPTX) export failed: HTTP (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (googleExportHttp !== null) return `export failed\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleExportHttp[1]!}\nstatus: HTTP ${googleExportHttp[2]!}${googleExportHttp[3] === undefined ? "" : `\ndetail: ${lineText(googleExportHttp[3]!)}`}`;
  const googleEditorMetadata = /^Google (Docs|Sheets) editor did not include save metadata$/.exec(message);
  if (googleEditorMetadata !== null) return `save metadata missing\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleEditorMetadata[1]!} editor`;
  const googleSaveFailed = /^Google (Docs|Sheets) save failed: ([\s\S]+)$/.exec(message);
  if (googleSaveFailed !== null) return `save failed\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleSaveFailed[1]!}\ndetail: ${lineText(googleSaveFailed[2]!)}`;
  const googleSaveVerification = /^Google (Docs|Sheets) save verification failed$/.exec(message);
  if (googleSaveVerification !== null) return `save verification failed\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleSaveVerification[1]!}`;
  const googleConflict = /^Google (Docs|Sheets|Slides) changed remotely and locally\. Resolve the conflict in Google (Docs|Sheets|Slides) or the local Markdown file before syncing again\.$/.exec(message);
  if (googleConflict !== null) return `sync conflict\nservice: Google Docs/Sheets/Slides\nsource: Google ${googleConflict[1]!}\nresolve: edit Google ${googleConflict[2]!} or local Markdown, then sync again`;
  const googleDocsMapping = /^Google Docs local edit cannot be mapped to the live document text$/.exec(message);
  if (googleDocsMapping !== null) return "local edit not mappable\nservice: Google Docs/Sheets/Slides\nsource: Google Docs\nresolve: edit Google Docs or simplify local Markdown";
  const googleFormattingOnly = /^Google Docs sync cannot upload formatting-only Markdown edits$/.exec(message);
  if (googleFormattingOnly !== null) return "local edit not uploadable\nservice: Google Docs/Sheets/Slides\nsource: Google Docs\ndetail: formatting-only Markdown edit";
  const googleFormattingSpan = /^Google Docs sync cannot preserve formatting in edited text$/.exec(message);
  if (googleFormattingSpan !== null) return "local edit not uploadable\nservice: Google Docs/Sheets/Slides\nsource: Google Docs\ndetail: edited text contains formatting";
  const googleSlidesDownloadOnly = /^Google Slides sync is download-only\. Revert local edits or use `wire download <url>` for a fresh copy\.$/.exec(message);
  if (googleSlidesDownloadOnly !== null) return "local edit not uploadable\nservice: Google Docs/Sheets/Slides\nsource: Google Slides\ndetail: download-only";
  const googleFormsDownloadOnly = /^Google Forms sync is download-only\. Revert local edits or use `wire download <url>` for a fresh copy\.$/.exec(message);
  if (googleFormsDownloadOnly !== null) return "local edit not uploadable\nservice: Google Forms\ndetail: download-only";
  const googleFormsDisabled = /^Google Forms API is disabled\. Enable it at ([^\s]+) then retry\.$/.exec(message);
  if (googleFormsDisabled !== null) return `api disabled\nservice: Google Forms\nenable: ${lineText(googleFormsDisabled[1]!)}\nretry: wire <form-url>`;
  const googleFormsScopes = /^Google Forms API token is missing required scopes\. Regenerate GOOGLE_FORMS_TOKEN_FILE with forms\.body and forms\.responses\.readonly scopes\.$/.exec(message);
  if (googleFormsScopes !== null) return "login invalid\nservice: Google Forms\ntoken: GOOGLE_FORMS_TOKEN_FILE\nscopes: forms.body, forms.responses.readonly";
  const googleFormsAuth = /^Google Forms API authentication is missing or expired\. Set GOOGLE_FORMS_TOKEN_FILE to an OAuth token with Forms scopes, then retry\.$/.exec(message);
  if (googleFormsAuth !== null) return "login required\nservice: Google Forms\ntoken: GOOGLE_FORMS_TOKEN_FILE\nscopes: forms.body, forms.responses.readonly";
  const googleFormsApi = /^Google Forms API ([\s\S]+?) failed: HTTP (\d+)(?: ([\s\S]+))?$/.exec(message);
  if (googleFormsApi !== null) return `api failed\nservice: Google Forms\noperation: ${lineText(googleFormsApi[1]!)}\nstatus: HTTP ${googleFormsApi[2]!}${googleFormsApi[3] === undefined ? "" : `\ndetail: ${lineText(googleFormsApi[3]!)}`}`;
  const googleSyncBase = /^Google sync base must ([\s\S]+)$/.exec(message);
  if (googleSyncBase !== null) return `sync base invalid\nservice: Google Docs/Sheets/Slides\ndetail: must ${lineText(googleSyncBase[1]!)}`;
  const googleSheetsSyncBase = /^Google Sheets sync base ([\s\S]+)$/.exec(message);
  if (googleSheetsSyncBase !== null) return `sync base invalid\nservice: Google Docs/Sheets/Slides\nsource: Google Sheets\ndetail: ${lineText(googleSheetsSyncBase[1]!)}`;
  const googleSheetsFormulaCell = /^Google Sheets sync cannot upload formula-like cell text at row (\d+), column (\d+)\nPrefix it with an apostrophe or rewrite it as plain text before syncing\.$/.exec(message);
  if (googleSheetsFormulaCell !== null) return `formula-like cell blocked\nservice: Google Docs/Sheets/Slides\nsource: Google Sheets\ncell: row ${googleSheetsFormulaCell[1]!}, column ${googleSheetsFormulaCell[2]!}\nresolve: prefix with an apostrophe or rewrite as plain text`;
  if (message === "Google Sheets sync requires fenced CSV to end with ```") return "local CSV invalid\nservice: Google Docs/Sheets/Slides\nsource: Google Sheets\ndetail: fenced CSV must end with ```";
  const googleSheetsTable = /^Google Sheets sync requires (a Markdown table(?: separator row)?|every Markdown table row to have the same number of cells|every Markdown table row to have \d+ cells: line \d+ has \d+)$/.exec(message);
  if (googleSheetsTable !== null) return `local table invalid\nservice: Google Docs/Sheets/Slides\nsource: Google Sheets\ndetail: requires ${lineText(googleSheetsTable[1]!)}`;
  const missingPath = /^Resource path (not found|is not registered): ([\s\S]+)$/.exec(message);
  if (missingPath !== null) return `${missingPath[1] === "not found" ? "resource not found" : "resource not registered"}\npath: ${lineText(missingPath[2]!)}`;
  const missingResource = /^Resource (identifier |URL )?not found: ([\s\S]+)$/.exec(message);
  if (missingResource !== null) return `resource not found\n${missingResource[1] === "URL " ? "url" : missingResource[1] === "identifier " ? "identifier" : "id"}: ${lineText(missingResource[2]!)}`;
  const ambiguousPath = /^Ambiguous resource path ([\s\S]+?): ([\s\S]+)\. Use a resource id or URL\.$/.exec(message);
  if (ambiguousPath !== null) return `ambiguous resource\npath: ${lineText(ambiguousPath[1]!)}\nmatches: ${lineText(ambiguousPath[2]!)}\nuse: resource id or URL`;
  return message;
}

function thrownMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error["message"] === "string") return error["message"];
  if (typeof error === "object" && error !== null) return JSON.stringify(error);
  return String(error);
}

function userFacing<T>(operation: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(operation).catch((error: unknown) => {
    if (error instanceof UserError) throw error;
    const message = thrownMessage(error);
    if (wireUserErrorMessage(message)) throw new UserError(wireUserErrorDisplayMessage(message));
    if (!(error instanceof Error)) throw new Error(message);
    throw error;
  });
}

function serviceTitle(service: AuthService): string {
  return {
    asana: "Asana",
    chatgpt: "ChatGPT",
    gmail: "Gmail",
    "google-docs": "Google Docs/Sheets/Slides",
    notion: "Notion",
    slack: "Slack",
    zoom: "Zoom",
  }[service];
}

function formatIdentityField(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => formatIdentityField(item)).join(", ");
  if (typeof value === "object" && value !== null) return lineText(JSON.stringify(value));
  return lineText(String(value));
}

function formatIdentityFields(identity: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(identity).map(([name, field]) => [lineText(name), field] as const);
  if (entries.length === 0) return "";
  const width = Math.max(...entries.map(([name]) => name.length));
  return entries.map(([name, field]) => `${name}: ${" ".repeat(width - name.length)}${formatIdentityField(field)}`).join("\n");
}

function formatAuthStatus(value: AuthResult): string {
  const identity = value.identity;
  if (identity["saved"] === true) return `${serviceTitle(value.service)} login saved`;
  if (value.service === "asana" && identity["name"] !== undefined && identity["email"] !== undefined && identity["gid"] !== undefined) return `${serviceTitle(value.service)} authenticated\nname:   ${formatIdentityField(identity["name"])}\nemail:  ${formatIdentityField(identity["email"])}\nuser:   ${formatIdentityField(identity["gid"])}`;
  if (value.service === "slack" && identity["user"] !== undefined && identity["team"] !== undefined && identity["url"] !== undefined && identity["user_id"] !== undefined && identity["team_id"] !== undefined) return `${serviceTitle(value.service)} authenticated\nuser:      ${formatIdentityField(identity["user"])}\nworkspace: ${formatIdentityField(identity["team"])}\nurl:       ${formatIdentityField(identity["url"])}\nuser_id:   ${formatIdentityField(identity["user_id"])}\nteam_id:   ${formatIdentityField(identity["team_id"])}`;
  if (value.service === "gmail" && identity["email"] !== undefined) return `${serviceTitle(value.service)} authenticated\nemail: ${formatIdentityField(identity["email"])}`;
  if (value.service === "gmail" && identity["emailAddress"] !== undefined && identity["messagesTotal"] !== undefined) return `${serviceTitle(value.service)} authenticated\nemail:    ${formatIdentityField(identity["emailAddress"])}\nmessages: ${formatIdentityField(identity["messagesTotal"])}`;
  if (value.service === "google-docs") {
    if (identity["email"] !== undefined) return `${serviceTitle(value.service)} authenticated\nemail: ${formatIdentityField(identity["email"])}`;
    if (identity["user"] !== undefined) {
      const user = identity["user"] as Readonly<Record<string, unknown>>;
      return `${serviceTitle(value.service)} authenticated\nname:          ${formatIdentityField(user["displayName"])}\nemail:         ${formatIdentityField(user["emailAddress"])}\npermission_id: ${formatIdentityField(user["permissionId"])}`;
    }
  }
  if (value.service === "notion" && identity["user_id"] !== undefined && identity["space_id"] !== undefined) return `${serviceTitle(value.service)} authenticated\nuser_id:  ${formatIdentityField(identity["user_id"])}\nspace_id: ${formatIdentityField(identity["space_id"])}`;
  if ((value.service === "chatgpt" || value.service === "zoom") && identity["account_id"] !== undefined) return `${serviceTitle(value.service)} authenticated\naccount: ${formatIdentityField(identity["account_id"])}`;
  const fields = formatIdentityFields(identity);
  return fields === "" ? `${serviceTitle(value.service)} authenticated` : `${serviceTitle(value.service)} authenticated\n${fields}`;
}

export const wirePresentation: WirePresentation = Object.freeze({
  init: render(formatInitializedWire),
  switchBackend: render(formatSwitchedBackend),
  attach: { json: wireResultJson, markdown: formatWireResult, rich: (value: WireResult, primitives: any) => richText(formatWireResultRich(value, primitives), primitives) },
  view: render((value: FetchedDocument) => value.markdown),
  sync: { json: wireResultJson, markdown: formatWireResult, rich: (value: WireResult, primitives: any) => richText(formatWireResultRich(value, primitives), primitives) },
  download: { json: wireResultJson, markdown: formatWireResult, rich: (value: WireResult, primitives: any) => richText(formatWireResultRich(value, primitives), primitives) },
  detach: { json: wireResultJson, markdown: formatWireResult, rich: (value: WireResult, primitives: any) => richText(formatWireResultRich(value, primitives), primitives) },
  watch: {
    json: watchSessionJson,
    markdown: formatWatchSession,
    rich: (value: WireWatchSession, primitives: any) => richText(formatWatchSession(value), primitives),
  },
  open: { json: resourceJson, markdown: formatOpenedResource, rich: (value: Resource, primitives: any) => richText(formatOpenedResource(value), primitives) },
  syncAll: { json: (value: readonly WireResult[]) => value.map(wireResultJson), markdown: formatWireResults, rich: (value: readonly WireResult[], primitives: any) => richText(formatWireResultsRich(value, primitives), primitives) },
  authStatus: render(formatAuthStatus),
  authLogout: render<{ readonly service: AuthService; readonly deleted: true }>((value) => `${serviceTitle(value.service)} logged out`),
});

function authGroup(service: AuthService, description: string, loginDescription: string, auth: Auth, readInput: TextInputReader | undefined, options: WireRootOptions): Group {
  const login = async (paste: boolean | undefined) => {
    if (paste === true && !options.allowPaste) throw new UserError("Cookie paste is CLI-only.");
    return paste === true ? auth.pasteCookies(service, await readInput!()) : service === "asana" ? auth.extractAsana() : service === "chatgpt" ? auth.extractChatgpt() : service === "gmail" ? auth.extractGmail() : service === "google-docs" ? auth.extractGoogleDocs() : service === "notion" ? auth.extractNotion() : service === "slack" ? auth.extractSlack() : auth.extractZoom();
  };
  const title = serviceTitle(service);
  return defineGroup({ name: service, description, children: [
    defineCommand({ name: "status", description: `Check saved ${title} login.`, params: S.Object({}), handler: () => userFacing(() => auth.status(service)), render: wirePresentation.authStatus }),
    defineCommand({ name: "login", description: loginDescription, params: S.Object({ paste: S.Optional(S.Boolean({ description: "Read cookie text from stdin.", scope: ["cli", "sdk"] })) }), handler: ({ params }) => userFacing(() => login(params.paste)), render: wirePresentation.authStatus }),
    defineCommand({ name: "logout", description: `Delete saved ${title} cookies.`, params: S.Object({}), handler: () => auth.logout(service), render: wirePresentation.authLogout }),
  ] });
}

export function createRoot(wire: Wire, currentDirectory: string, auth?: Auth, readInput?: TextInputReader, options: WireRootOptions = { allowPaste: true }): WireRoot {
  const attachFromCliUrl = (url: string) => {
    const removedCommand = removedCliCommandNames[url as keyof typeof removedCliCommandNames];
    if (removedCommand !== undefined) throw new UserError(`Unknown command: ${url}. ${removedCommand}`);
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(url)) throw new UserError(`Expected source URL: ${url}`);
    return userFacing(() => wire.attach(url, currentDirectory));
  };
  const defaultAttach = defineCommand({
    name: "attach",
    description: "Track a source URL as local Markdown. Shorthand: wire <url>.",
    positional: ["url"],
    params: S.Object({ url: S.String({ description: "Supported source URL to attach." }) }),
    handler: ({ params }) => attachFromCliUrl(params.url),
    render: wirePresentation.attach,
  });
  const authCommand = (service: (typeof authServices)[number]) => {
    const title = serviceTitle(service);
    return authGroup(service, `Manage ${title} login.`, "Capture cookies once; normal commands reuse saved cookies.", auth!, readInput, options);
  };
  return defineGroup({
    name: "",
    description: "Sync web resources with local Markdown.",
    scope: ["cli", "mcp", "sdk"],
    children: [
      defaultAttach,
      defineCommand({
        name: "init",
        description: "Initialize a wire workspace in the current directory.",
        params: S.Object({
          backend: S.Optional(S.Enum(["files", "sqlite"], { default: defaultWireBackend, description: "Registry backend: files or sqlite." })),
        }),
        handler: ({ params }) => userFacing(() => wire.init(currentDirectory, params.backend as WireBackend, registryPathForBackend(params.backend as WireBackend))),
        render: wirePresentation.init,
      }),
      defineCommand({
        name: "preview",
        description: "Preview a source URL without writing files.",
        positional: ["url"],
        params: S.Object({ url: S.String({ description: "Supported source URL to preview." }) }),
        handler: ({ params }) => userFacing(() => wire.view(params.url)),
        render: wirePresentation.view,
      }),
      defineCommand({
        name: "switch-db",
        description: "Convert the workspace registry between sqlite and files.",
        scope: ["cli"],
        hidden: true,
        params: S.Object({}),
        handler: () => userFacing(() => wire.switchBackend(currentDirectory)),
        render: wirePresentation.switchBackend,
      }),
      defineCommand({
        name: "sync",
        description: "Two-way sync one registered resource.",
        positional: ["resource"],
        params: S.Object({ resource: S.String({ description: "Registered resource URL, resource ID, or Markdown path." }) }),
        handler: ({ params }) => userFacing(() => wire.sync(params.resource, currentDirectory)),
        render: wirePresentation.sync,
      }),
      defineCommand({
        name: "download",
        description: "Download a source URL as local Markdown without tracking it.",
        positional: ["url"],
        params: S.Object({ url: S.String({ description: "Supported source URL to download." }) }),
        handler: ({ params }) => userFacing(() => wire.downloadSource(params.url, currentDirectory)),
        render: wirePresentation.download,
      }),
      defineCommand({
        name: "detach",
        description: "Download one registered resource and stop tracking it.",
        positional: ["resource"],
        params: S.Object({ resource: S.String({ description: "Registered resource URL, resource ID, or Markdown path." }) }),
        handler: ({ params }) => userFacing(() => wire.detach(params.resource, currentDirectory)),
        render: wirePresentation.detach,
      }),
      defineCommand({
        name: "watch",
        description: "Continuously sync a registered Markdown file.",
        scope: ["cli"],
        positional: ["file"],
        params: S.Object({ file: S.String({ description: "Registered Markdown path to watch." }) }),
        handler: ({ params }) => userFacing(() => wire.watch(params.file, currentDirectory)),
        render: wirePresentation.watch,
      }),
      defineCommand({
        name: "open",
        description: "Open a registered resource URL and show details.",
        positional: ["resource"],
        params: S.Object({ resource: S.String({ description: "Registered resource URL, resource ID, or Markdown path." }) }),
        handler: ({ params }) => userFacing(() => wire.openResource(params.resource, currentDirectory)),
        render: wirePresentation.open,
      }),
      defineCommand({
        name: "sync-all",
        description: "Sync this directory tree; continue after failures.",
        params: S.Object({}),
        handler: () => userFacing(() => wire.syncAll(currentDirectory)),
        render: wirePresentation.syncAll,
      }),
      ...(auth === undefined ? [] : authServices.map(authCommand)),
    ] as const,
    default: defaultAttach,
  });
}
