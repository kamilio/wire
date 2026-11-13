# Wire

[![npm](https://img.shields.io/npm/v/%40kamilio%2Fwire)](https://www.npmjs.com/package/@kamilio/wire)

Sync Notion, Google Docs, Slack, Gmail, Asana, ChatGPT, and Zoom into local Markdown.

Wire turns web resources into files your editor, repo, and coding agents can use. Attach a URL once, edit it as Markdown, and sync — pulling remote changes down and pushing supported local edits back.

## Install

```sh
npm install -g @kamilio/wire
```

Requires Node 20+.

## Quick Start

```sh
wire notion login                          # authenticate a service once
wire https://www.notion.so/example/page    # attach a URL as tracked Markdown
wire sync-all                              # refresh everything, push local edits back
```

Tracking lives in `~/.wire` by default. Run `wire init` inside a project to track its resources locally in `.wire/` instead.

## Providers

| Provider | Resources | Sync |
| --- | --- | --- |
| Notion | Pages | Two-way |
| Google Docs | Documents | Two-way with OAuth, pull only with browser login |
| Google Sheets | Spreadsheets | Two-way |
| Google Slides | Presentations | One-way |
| Google Forms | Forms and responses | One-way |
| Asana | Projects | Two-way |
| Asana | Tasks | One-way |
| Slack | Messages and threads | One-way |
| Gmail | Email threads | One-way |
| ChatGPT | Conversations, whole history, projects and files | One-way |
| Zoom | Docs and meeting transcripts | One-way |

Two-way syncs pull remote changes and push local Markdown edits back to the source. One-way syncs only refresh the local file.

Each service authenticates separately with `wire <service> login`, `wire <service> status`, and `wire <service> logout`.

## Commands

```sh
wire <url>               # attach a URL as tracked Markdown
wire preview <url>       # inspect a resource without writing files
wire download <url>      # save Markdown once without tracking it
wire sync <file-or-url>  # sync one tracked resource
wire sync-all            # sync the current directory tree
wire open <resource>     # open the source and show local details
wire detach <resource>   # download once, then stop tracking it
wire watch <file>        # sync a file whenever it changes
```

## Local editing and history

Use a registered document’s Markdown path, resource ID, or URL:

```sh
wire shell Notes.md 'sed -i "s/Old heading/New heading/" document.md'
wire status Notes.md
wire diff Notes.md
wire history Notes.md
wire sync Notes.md
```

The shell gets a private in-memory copy at `/document.md`. Quote the script so redirections run inside that shell. It can read and edit text with commands such as `cat`, `grep`, `sed`, and `printf`. Only the final contents of `/document.md` are saved, and only if the script succeeds and the working copy has not changed. Other virtual files disappear. No commit message or review comment is needed. A running `wire watch` can trigger sync automatically.

By default, the Markdown file exactly matches the downloaded document. A history timestamp records when Wire observed the text. It cannot tell when you typed it, capture saves that were replaced before Wire saw them, or tell which revision an old editor window was showing. Saving that window after a download can look like a new edit that reverses the download.

If an editor writes to an old open file after Wire replaces it, run `wire history Notes.md`. Wire checks retained files for that document and lists any newly discovered text as a `recovered` revision. Inspect it with `wire diff Notes.md --from working --to REVISION_ID` and copy any changes you want to keep. Discovery leaves both the working file and the remote document alone.

For a Google Doc, enable editor receipts when attaching, or repeat attach on its clean registered link:

```sh
wire attach 'https://docs.google.com/document/d/DOCUMENT_ID/edit' --editor-receipts
```

Wire adds a local HTML comment to the Markdown. Keep it with the buffer: when an old window saves, Wire uses its receipt to find the revision that window saw. Wire removes the comment before sending content to Google Docs and hides it from `wire diff` and `wire shell`. Editors and hooks that read the file directly see the comment. An absent, invalid, or foreign receipt stops sync and leaves the file intact. Receipts identify an editing base; they do not record keystrokes or prove when an edit happened.

If an old editor buffer replaces an unpublished shell draft, `wire sync Notes.md` first combines disjoint paragraph edits when both drafts have a single known common ancestor and the same remote base. If the edits overlap or their ancestry is uncertain, `wire conflicts Notes.md` shows both local revisions. Compare them with `wire diff Notes.md --from editor --to shell`. To combine them, edit the working file and run `wire resolve Notes.md working`; to select one unchanged side, use `editor` or `shell`. Then run `wire sync Notes.md` to merge with the latest remote document.

A shell edit is published only if the provider can check that the remote revision still matches. Google Docs supports this with write access. For a Notion page, Sheet, or another provider without this check, Wire keeps the local draft and refuses the upload. You can copy the intended changes into the provider yourself.

If sync reports a conflict, compare both saved versions, then choose which content to keep:

```sh
wire conflicts Notes.md
wire diff Notes.md --from local --to remote
wire resolve Notes.md working    # use the file after editing it yourself
wire sync Notes.md
```

Use `local` or `remote` instead of `working` to select a saved side. Resolution updates the local file. `wire diff` defaults to the last sync versus the working copy. Pass revision IDs from `wire history` to compare older versions.

For a Notion page with subpages, `wire download <url>` saves a directory with an `index.md` for each page. Open the root index and follow the local links. Ordinary links and mentions stay remote. Pages without subpages still download as one Markdown file.

Run `wire --help` for the full CLI.

### Sync a Google Doc

`wire sync <file>` merges edits to different paragraphs. It applies local edits to the selected tab in one batch, conditional on the current Google Docs revision. For documents with several tabs, attach the URL of the tab you want to edit, including its `tab=` parameter. An unscoped download can contain all tabs. Nested list items keep their own paragraphs. In imported lists, a plain section label between two spacers can cross one nested bullet group without recreating its bullets. If both sides changed the same paragraph, open the local file and the Doc to reconcile it. Wire leaves both copies in place. It also stops when it cannot safely map an edit to the native paragraphs.

Attached Markdown embeds original image pixels at the size used in Google Docs. Syncing an older attachment upgrades its thumbnails locally. Edit the image itself in Google Docs.

**Change for existing users**. Google’s browser editor can accept a stale save and combine two versions of the same paragraph. Browser login now supports downloads only. For uploads, set `GOOGLE_DOCS_TOKEN_FILE` to an authorized OAuth token with Google’s `drive` scope, a `drive.file` grant for that file, or both `documents` and `drive.readonly`. Wire needs access to Drive comments to protect anchored feedback. Wire also accepts an eligible existing `GOOGLE_FORMS_TOKEN_FILE` used for Drive. For grants that need refreshing, set `GOOGLE_CREDENTIALS_FILE` to the corresponding client credentials.

### Scrape a Google Drive folder

Use `wire gdrive preview <url>` to list a folder or read a Drive file without saving it. A spreadsheet preview shows the first tab. Run `wire gdrive scrape <folder-url>` to download into a directory named after the Drive folder. Use `wire gdrive scrape <google-sheets-url>` to export a spreadsheet and download the Drive files linked from its tabs. Wire keeps the original XLSX workbook and writes a Markdown table for each tab in a companion file. It preserves displayed values, links and blank positions within each tab’s used range. Files use their Drive titles. Duplicate titles get numbered names such as `Review (2).md`. The manifest keeps the Drive IDs and source cells so refreshes keep using the same files. Spreadsheet scrapes save linked PDFs with their Markdown copies. Linked folders are reported but not traversed, and linked spreadsheets are exported without following another level of links. Inside that directory, run `wire gdrive scrape` to refresh. Wire keeps the Drive folder structure, exports Docs to Markdown, Sheets to XLSX (all tabs), and Slides to PPTX. Uploaded DOCX files get a Markdown copy from Safe Bash Pandoc. Use `--delete-verified-docx` to discard the local DOCX only when native `pandoc` and `unzip` independently verify the content. Documents with comments, images, other embedded content, or a conversion mismatch retain the original. Other uploaded files retain their original format. By default Wire keeps the original PDF beside its Markdown. With `--delete-verified-pdfs`, on either a scrape or a refresh, Wire keeps only Markdown when the bundled reader and an independent, warning-free `pdftotext` check agree and the local files still match their recorded hashes. If verification is unavailable or uncertain, the original stays. A refresh does not redownload a previously verified and removed PDF unless the source changes or its Markdown is missing. Review packets preserve questions, reviewer roles, selected answers and visibility notices. The PDF reader is bundled. Image-only PDFs are kept as originals and reported; Wire does not run OCR. Shortcuts and unsupported Google-native items are reported rather than followed.

Set `GOOGLE_CREDENTIALS_FILE` and `GOOGLE_FORMS_TOKEN_FILE` to your OAuth client and matching saved token with Drive read access. The paths can also be set in the Wire workspace configuration. The scraper never writes to Drive; a locally edited download is reported and left intact.

### Browse Asana

```sh
wire asana projects list           # workspace → team → active project, with project IDs
wire asana projects show <project-id> # project sections in order, with section IDs
wire asana tasks move <task-id> --project <project-id> --section <name-or-id>
wire asana tasks list <project-id> # task names, completion status, and IDs
wire asana tasks show <task-id>    # Markdown description, custom fields, comments with IDs, and activity
wire asana users lookup <name-or-email>  # find an assignee by partial name or exact email
wire asana tasks create <project-id> --section <name-or-id> --title 'New task' --body 'A **Markdown** description' --assignee person@example.com
wire asana tasks edit <task-id> --assignee person@example.com
wire asana tasks edit <task-id> --title 'New title' --body 'A **Markdown** description'
wire asana tasks edit <task-id> --fields '{"completed":false,"custom_fields":{"<field-id>":"<option-id>"}}'
wire asana tasks comment <task-id> --body 'See the [spec](https://example.com/spec).'
wire asana comments edit <comment-id> --body 'Updated **comment**.'
```

Asana reads use your saved Wire login. For writes, set `ASANA_ACCESS_TOKEN` to a personal access token for the same account. Alternatively, set `ASANA_TOKEN_FILE` to the path of a dotenv file containing `ASANA_ACCESS_TOKEN`. If neither is set, Wire uses saved cookies, which Asana may reject for writes.

Use `tasks show --json` for enum option IDs under `data.task.custom_fields`. For `--fields`, supply only the writable Asana properties to change. Keep IDs as strings; numbers, arrays, booleans, and null keep their JSON types. Task descriptions, text custom fields, and comment bodies take Markdown. To revise existing text, `tasks show --json` returns the description in `data.task.body_markdown` and each comment in `data.stories[].body_markdown`. Asana enforces field and comment edit permissions.

### People and Slack threads

Use `[@Name](mailto:person@example.com)` to mention someone in Markdown. Wire resolves the email to a native user mention when syncing to Notion or sending/editing Slack messages. Ordinary email links and code stay literal. Missing or ambiguous users fail before writing.

```sh
wire slack users lookup person@example.com
wire notion users lookup 'Full Name'
wire slack send '#channel' 'Hello [@Name](mailto:person@example.com)'
wire slack edit <message-url> '<replacement Markdown>'
```

In Slack, a top-level `---` with blank lines around it splits Markdown into messages: the first goes to the channel, and the rest reply in its thread. Sending to a thread URL puts all sections in that thread. Editing replaces the selected message and appends any later sections as replies; it does not replace existing replies. Separators inside code, frontmatter, quotes, or lists do not split the message. If posting stops partway through, the error lists the messages already written so you can continue without reposting them.

### ChatGPT archives

```sh
wire chatgpt login
wire download https://chatgpt.com/
wire download https://chatgpt.com/g/g-p-6a9702085aa081919400a53261afae49/project
```

The root URL exports to `chatgpt/index.md`, with separate account, project, conversation,
and Library directories. It paginates active, archived, and starred chats and all
accessible projects, including shared projects. Each conversation includes readable
Markdown plus the full returned JSON, preserving alternate branches, tool messages,
citations, and attachment references. Project instructions, source metadata, canvases,
and downloadable attachments and Library files are saved too. Project URLs export
only that project's content under `chatgpt/projects/<id>/`, with `export.md` as the index.

`manifest.json` records completed resources, file hashes, unavailable accounts, errors,
and cooldowns. Requests run sequentially. HTTP 429 and transient server failures honor
`Retry-After` (seconds or HTTP dates, adjusted for server clock skew); without a valid
header, retries use 1, 2, 4, and 8 second backoffs. The manifest records the precise
retry deadline and whether it came from the server or fallback policy. After five
rate-limited attempts the export stops making requests, retains completed files, and
reports a partial result with the earliest retry time. Run the command again to refresh
the same ID-based paths; files no longer returned by the server are not deleted.

Exports never include session credentials. Deleted chats, expired assets, inaccessible
workspaces, and the contents of external linked sources cannot be recovered by this
export; available source metadata and download failures remain in the archive.
Whole-history and project exports are one-off downloads, not tracked two-way syncs.

## MCP

`wire-mcp` exposes the same tools to MCP clients over stdio:

```json
{ "mcpServers": { "wire": { "command": "wire-mcp" } } }
```

## Hooks

Wire follows Husky-style lifecycle hooks: executable files in `.wire/hooks` run automatically, no enabling needed.

- `.wire/hooks/post-resource` and `.wire/hooks/post-resource.d/*` — after each synced resource
- `.wire/hooks/post-batch` — after a batch of syncs
- `.wire/hooks/post-command` — after every command

Hooks run from the workspace root with `WIRE_*` env vars such as `WIRE_COMMAND`, `WIRE_ROOT`, `WIRE_SERVICE`, `WIRE_TITLE`, `WIRE_PATH`, and `WIRE_RESULT_COUNT`. Exit non-zero to fail Wire. Example `post-resource` hook that files docs by service:

```sh
mkdir -p "docs/$WIRE_SERVICE" && dest="docs/$WIRE_SERVICE/$WIRE_TITLE.md" && mv "$WIRE_PATH" "$dest" && echo "WIRE_PATH=$dest"
```

## Configuration

Workspace config lives in `.wire/config.json` and applies to Wire plus hooks:

```json
{ "backend": "sqlite", "path": "registry.sqlite3", "env": { "WIRE_CUSTOM_VALUE": "example" } }
```

`wire switch-db` changes the workspace registry between files and SQLite. If a document operation or another switch is active, retry when it finishes. The destination must be unused; a pre-existing database, directory, or SQLite sidecar is preserved. If a switch is interrupted, `.wire/config.json` identifies the active backend. Inspect the other copy before moving it aside and retrying.
