# Wire

Wire syncs web resources into local Markdown files.

Use it when important working context lives in tools like Notion, Google Docs, Gmail, Slack, Asana, ChatGPT, or Zoom, but your codebase and agents need that context as normal files.

## Use Cases

- Commit notes, specs, meeting docs, and project plans into the codebase.
- Give coding agents access to live product docs, task context, and decisions without copy-paste.
- Attach local Markdown to the original source so updates can be pulled again later.
- Edit supported Markdown files locally and sync changes back to the source.
- Run local automation after syncs, such as moving files, indexing docs, or notifying another tool.

## Basic Flow

Initialize a workspace:

```sh
wire init
```

Attach a source URL as Markdown:

```sh
wire https://www.notion.so/example/page
```

Download a source URL once without tracking it:

```sh
wire download https://www.notion.so/example/page
```

Refresh one file:

```sh
wire sync docs/example.md
```

Detach one file after downloading the latest source copy:

```sh
wire detach docs/example.md
```

Preview a source URL without writing a file:

```sh
wire preview https://www.notion.so/example/page
```

Refresh the current directory tree:

```sh
wire sync-all
```

## Hooks

Wire follows Husky-style lifecycle hooks. Executable files in `.wire/hooks` run automatically and do not need enabling.

Hooks:

- `.wire/hooks/post-resource`
- `.wire/hooks/post-resource.d/*`
- `.wire/hooks/post-batch`
- `.wire/hooks/post-command`

Hooks run from the workspace root with `WIRE_*` env vars like `WIRE_COMMAND`, `WIRE_ROOT`, `WIRE_SERVICE`, `WIRE_TITLE`, `WIRE_PATH`, and `WIRE_RESULT_COUNT`. Exit non-zero to fail Wire.

Move a file and update the registry:

```sh
mkdir -p "docs/$WIRE_SERVICE" && dest="docs/$WIRE_SERVICE/$WIRE_TITLE.md" && mv "$WIRE_PATH" "$dest" && echo "WIRE_PATH=$dest"
```

## Env

Shared env lives in `.wire/config.json` and applies to Wire plus hooks:

```json
{ "backend": "sqlite", "path": "registry.sqlite3", "env": { "WIRE_CUSTOM_VALUE": "example" } }
```
