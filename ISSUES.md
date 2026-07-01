# Wire UX Issues

Review findings ranked by severity. Each entry states the current behavior and the correct behavior. Uploading an unregistered markdown file via `wire sync` (creating a new Notion page) is intended behavior and is not listed.

## Critical — data loss / destructive writes

### 1. Deleting or renaming a linked local file wipes the remote document on next sync

`packages/wire-core/src/operations.ts:276`

Current: a missing local file is read as `""`, treated as an intentional local edit, and pushed upstream. For Notion the diff push deletes every remote block (`notion-sync.ts:948-962`). A rename plus `sync-all` erases the original Notion page and, via the unregistered-path upload, creates a duplicate new one.

Correct: a registered resource whose local file is missing must fail the sync with an error naming the registered path (e.g. `Linked file missing: docs/spec.md — restore it or run wire detach`). Empty push must only happen when the file exists and is actually empty.

### 2. Re-running `wire <url>` on an already-attached resource discards local edits

`packages/wire-core/src/operations.ts:172-180`

Current: `attach`/`store` writes remote content over the linked file unconditionally. `sync` has three-way conflict detection; `attach` has none.

Correct: when the URL resolves to an existing resource, attach must compute `localChanged` against the stored snapshot like `sync` does. If local edits exist, fail with a message pointing at `wire sync <path>`; otherwise refresh in place.

### 3. Read-only providers: sync overwrites local edits and labels it "uploaded"

`packages/wire-core/src/core/source.ts:64`, `packages/wire-core/src/operations.ts:279-282`

Current: providers without `synchronize` (slack, gmail, chatgpt, zoom, asana-task) fall back to plain fetch. Sync detects `localChanged`, then overwrites the local file anyway; if the remote also changed, the action is reported as "uploaded" for a provider that cannot upload. `wire watch` two-way mode repeats this every poll.

Correct: when `localChanged` is true and the provider has no `synchronize`, fail with an error stating the provider is download-only and the local file has edits (suggest `wire download` to discard them). The "uploaded" action must be impossible for providers without upload.

### 4. Asana project sync permanently deletes tasks when a line is removed from markdown

`packages/provider-asana/src/asana-project.ts:158,172`

Current: the markdown view is only name + checkbox, but removing a line issues `DELETE /tasks/{gid}`, destroying descriptions, comments, and attachments never shown in the file.

Correct: a task line removed locally must not hard-delete the task. Either fail with a list of tasks that would be deleted, or mark them completed instead of deleted. Deletion of content invisible in the markdown must never be a silent side effect.

## Critical — sync correctness

### 5. Notion sync crashes on any page containing a UI-created table

`packages/provider-notion/src/notion-sync.ts:549`

Current: local parsed rows are keyed `column_0…N` while remote tables use random column IDs; the cell lookup throws `TypeError: value is not iterable` on any edit to such a page, permanently breaking sync for it.

Correct: `canonicalParserBlock` must map local positional columns onto the remote `columnOrder` by index, so tables round-trip and diff like every other block type.

### 6. Google Docs write-back half-applies multi-region edits, then wedges the doc in permanent conflict

`packages/provider-google-docs/src/google-docs.ts:563-573,733,736`

Current: `textEdit` extracts only the first contiguous edit region. With two edits, the first is written to the live doc, verification fails after the mutation, and every later sync reports "changed remotely and locally".

Correct: compute all edit regions and apply them in one `batchUpdate` (back-to-front so indexes stay valid). Verification failure must not leave the base snapshot stale after a partial mutation — either the whole edit set applies and the base updates, or nothing is sent.

### 7. Google Docs edits are inserted as plain text, destroying formatting in the edited span

`packages/provider-google-docs/src/google-docs.ts:648-651`

Current: an edit is applied as delete-range + insert of stripped text, so rewording a sentence containing a hyperlink or bold text removes the styling from the doc.

Correct: minimize the replaced range to the actual changed characters, and re-apply the styles/links that covered the surviving text. If a style-bearing span cannot be preserved, fail before mutating.

### 8. Notion round-trip is not idempotent — unrelated blocks get rewritten remotely

`packages/provider-notion/src/notion-sync.ts:194-211,747,775`

Current: rendered markdown re-parses as something different for multi-line quotes (truncated), paragraphs containing backticks (gain code marks), and paragraphs starting with `# ` or `- ` (converted to header/list). Any one-word edit anywhere then emits destructive ops against blocks the user never touched.

Correct: render must escape everything the parser treats as syntax (backticks, leading `#`/`-`/`1.`, etc.) and encode soft line breaks in quotes, so render→parse is identity. A round-trip test over these block types should gate changes to the renderer/parser pair.

### 9. Notion writes use the account's first workspace instead of the page's own

`packages/provider-notion/src/notion-sync.ts:803-804,864-865`

Current: `spaceId` comes from `Object.keys(spaceView)[0]`; all transactions and `x-notion-space-id` headers point at the first workspace even when the page lives elsewhere.

Correct: use the `space_id` carried on the fetched page's own block for sync transactions. `upload` must take an explicit target (config or flag), not whichever workspace happens to be first.

## Major — hangs, misleading output, broken commands

### 10. Login flow hangs unkillably if the user quits the Chrome window

`packages/wire-core/src/runtime/chrome.ts:81-88,231-243`

Current: pending WebSocket requests never settle after the socket closes, and the SIGINT handler routes Ctrl+C into the same dead request, so the process survives Ctrl+C and needs `kill -9`.

Correct: on socket close, reject all pending requests, which propagates a "Chrome window closed before login completed" failure. Ctrl+C during a dead connection must still terminate the process.

### 11. MCP `<service>_login` with `paste: true` blocks the server forever

`packages/wire/src/executable.ts:12-17`, `packages/wire/src/adapters/root.ts:371`

Current: `readStandardInput` resolves only on stdin end; in MCP mode stdin is the JSON-RPC transport, so the tool call never returns.

Correct: the `paste` option must not be exposed as an MCP tool parameter; in MCP mode a `paste: true` call must fail immediately explaining paste is CLI-only.

### 12. VS Code "Sync All" reports failures as successes

`packages/wire-vscode-extension/src/extension.ts:250`

Current: `syncAll` returns per-resource `action: "failed"` entries; the extension shows "Synced N resources" counting them, so expired cookies leave everything silently stale and the login prompt never appears.

Correct: split the results — "Synced X, failed Y" with the first error surfaced, and route login-required errors through the existing `wireError` login prompt.

### 13. VS Code sync ignores unsaved editor content

`packages/wire-vscode-extension/src/extension.ts:229,247`

Current: sync reads from disk without saving the dirty editor, so unsaved edits are excluded from the upload and the disk write puts the buffer into VS Code's save-conflict dialog, where either choice loses data.

Correct: save the active document (and dirty documents under the directory for sync-all) before invoking wire.

### 14. `wire watch <file> --json` silently does nothing

`packages/wire/src/adapters/root.ts:192-193`

Current: the JSON renderer calls `value.close()` before serializing, printing an active-looking session and exiting immediately.

Correct: `--json` must not change watch semantics — keep the session alive and emit one JSON line per sync event (or reject `--json` for watch entirely).

### 15. `wire detach` doesn't download the final copy it promises

`packages/wire-core/src/operations.ts:296-305`

Current: README and CLI help say detach downloads the latest source copy first; it only reads whatever is on disk and deletes the registry entry, reporting success even if the file is missing.

Correct: fetch the source and write it to the linked path before deleting the registry entry, and fail if the linked file cannot be written.

### 16. Hooks never fire for `wire download` or `wire watch` syncs

`packages/wire/src/hooks.ts:185-196`, `packages/wire-core/src/operations.ts:322`

Current: `withWireHooks` wraps `wire.download` (unreachable from the CLI) instead of `downloadSource`, and watch's internal loop is bound to the un-hooked closures, so `post-resource`/`post-command` automation silently skips these paths.

Correct: wrap `downloadSource` (and `create`/`unlink` where reachable), and have watch invoke the hooked wire so every sync a user observes also runs their hooks.

### 17. Silent content truncation in providers

- `packages/provider-slack/src/slack.ts:67` — `conversations.replies` is called once with `limit: 999`; threads with more replies are cut with no indication. Correct: follow `response_metadata.next_cursor` until exhausted.
- `packages/provider-slack/src/slack.ts:95` — file attachments render only when the message text is empty; "here's the deck" + file loses the file. Correct: always render file links after the text.
- `packages/provider-gmail/src/gmail.ts:21-34` — non-text parts return `""`; attachments vanish with no placeholder. Correct: emit an attachment line (filename, type, size) for every non-text part.

### 18. Expired ChatGPT session throws a raw TypeError instead of the login hint

`packages/provider-chatgpt/src/chatgpt.ts:147-151`, `packages/wire/src/auth.ts:197-198`

Current: a logged-out `/api/auth/session` returns `200 {}`, passing both auth guards; `account["id"]` then throws `Cannot read properties of undefined (reading 'id')`, which `wireUserErrorMessage` does not recognize.

Correct: treat a session response without `account` as unauthenticated and throw the same login-required error every other service produces, so the user sees `run: wire chatgpt login`.

### 19. `wire sync-all` silently syncs nothing outside the registry root's parent tree

`packages/wire-core/src/operations.ts:365-369`, `packages/wire-core/src/storage/workspace.ts:46-48`

Current: with a home-level `.wire` and a target directory outside `$HOME`, the scope becomes a `../…` path that matches no registered link, and the command reports zero resources as if everything were up to date.

Correct: when the computed scope escapes the registry root, fail with an error naming the registry root and the out-of-scope directory instead of returning an empty result.

### 20. Repeated `wire download <url>` creates duplicate, diverging files

`packages/wire-core/src/operations.ts:219-222`

Current: `downloadSource` never checks whether the existing `title.md` came from the same resource; a second download writes `title-<service>-<id>.md` and leaves the stale original in place.

Correct: if the collision file's registered snapshot (or content) belongs to the same resource, overwrite it in place; only use the collision name for genuinely different resources.
