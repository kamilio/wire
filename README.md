# Wire

Wire syncs web resources to local Markdown.

## Husky-style hooks

Wire follows Husky-style lifecycle hooks. Executable files in `.wire/hooks` run automatically and do not need enabling.

Hooks: `post-resource`, `post-resource.d/*`, `post-batch`, `post-command`.

Hooks run from the workspace root with `WIRE_*` env vars like `WIRE_COMMAND`, `WIRE_ROOT`, `WIRE_SERVICE`, `WIRE_TITLE`, `WIRE_PATH`, and `WIRE_RESULT_COUNT`. Exit non-zero to fail Wire.

Move a file and update the registry:

```sh
mkdir -p "docs/$WIRE_SERVICE" && dest="docs/$WIRE_SERVICE/$WIRE_TITLE.md" && mv "$WIRE_PATH" "$dest" && echo "WIRE_PATH=$dest"
```

Shared env lives in `.wire/config.json`:

```json
{ "backend": "sqlite", "path": "registry.sqlite3", "env": { "WIRE_CUSTOM_VALUE": "example" } }
```
