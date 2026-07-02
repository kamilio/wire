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
| Google Docs | Documents | Two-way |
| Google Sheets | Spreadsheets | Two-way |
| Google Slides | Presentations | One-way |
| Google Forms | Forms and responses | One-way |
| Asana | Projects | Two-way |
| Asana | Tasks | One-way |
| Slack | Messages and threads | One-way |
| Gmail | Email threads | One-way |
| ChatGPT | Conversations | One-way |
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

Run `wire --help` for the full CLI.

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
