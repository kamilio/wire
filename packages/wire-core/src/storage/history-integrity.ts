import { createHash } from "node:crypto";
import type { HistoryRefs } from "./history.js";

const digest = /^[a-f0-9]{64}$/;
export const transactionId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function validateRefs(refs: HistoryRefs) {
  const corrupt = () => { throw new Error("Corrupt Wire history references. Restore the private history from a backup before syncing."); };
  const known = new Set<string>();
  if (!refs || !Array.isArray(refs.revisions)) return corrupt();
  for (const r of refs.revisions) {
    if (!r || !digest.test(r.blob) || !Array.isArray(r.parents) || r.parents.some(p => !known.has(p)) || known.has(r.id)) return corrupt();
    if (createHash("sha256").update(JSON.stringify([r.kind,r.blob,r.parents])).digest("hex") !== r.id) return corrupt();
    known.add(r.id);
  }
  for (const ref of [refs.base, refs.remote, refs.draft, refs.resolutionParent, refs.editorDraft]) if (ref != null && !known.has(ref)) return corrupt();
  if (refs.editorReceipts !== undefined) {
    if (!refs.editorReceipts || typeof refs.editorReceipts !== "object" || Array.isArray(refs.editorReceipts)) return corrupt();
    for (const [key, record] of Object.entries(refs.editorReceipts)) {
      if (!/^[a-f0-9]{48}$/.test(key) || !record || typeof record.crlf !== "boolean" || !known.has(record.shown) || !known.has(record.base)) return corrupt();
    }
  }
  if (refs.conflict && ![refs.conflict.base,refs.conflict.local,refs.conflict.remote].every(ref => known.has(ref))) return corrupt();
}
