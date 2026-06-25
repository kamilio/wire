# Wire

Sync Notion, Google Docs, Slack, Gmail, Asana, ChatGPT, and Zoom into local Markdown.

Wire turns web-based knowledge into files your editor, repo, scripts, and coding agents can use. Attach a source URL once, edit or review it as Markdown, then sync it again when the source changes.

## Install

```sh
npm install -g @kamilio/wire
```

## Start

```sh
wire init
wire https://www.notion.so/example/page
wire sync-all
```

Use `wire <url>` to attach a supported resource as a tracked Markdown file. Use `wire sync <file>` or `wire sync-all` to refresh local files and push supported edits back.

## Why Wire

- Local Markdown for product docs, specs, research, meetings, tasks, messages, and saved chats
- Two-way sync for supported resources instead of copy-paste drift
- A CLI that fits normal shell, Git, editor, and agent workflows
- `wire-mcp` for exposing the same tools to MCP clients

## Commands

```sh
wire preview <url>       # inspect a resource without writing files
wire download <url>      # save Markdown once without tracking it
wire sync <file-or-url>  # sync one registered resource
wire open <resource>     # open the source and show local details
wire detach <resource>   # download once, then stop tracking it
```

## Services

Wire supports Notion, Google Docs/Sheets/Slides, Slack, Gmail, Asana, ChatGPT, and Zoom.

```sh
wire notion login
wire google-docs login
wire slack login
```

Run `wire --help` for the full CLI.
