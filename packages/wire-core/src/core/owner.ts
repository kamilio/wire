import type { Resource, Service, Source } from "./model.js";

export function assertWireOwner<T>(resources: readonly Resource[], source: Source, service: Service<T>): void {
  const docs = source.service === "google-docs" && source.type === "document";
  const doc = source["document_id"] ?? source.identifier;
  for (const resource of resources) {
    const related = resource.identifiers.filter(id => id.service === source.service && (id.identifier === source.identifier ||
      (docs && resource.type === "document" && id.identifier.split("#tab=")[0] === doc)));
    if (!related.length) continue;
    const snapshot = resource.data.find(item => item.namespace === source.service && item.key === "snapshot")?.value;
    const owner = snapshot && typeof snapshot === "object" && "wire_owner" in snapshot ? snapshot.wire_owner : undefined;
    if (owner !== service.owner || (owner !== undefined && !related.every(id => id.identifier === source.identifier))) {
      throw new Error("Document already has a different sync owner. Use its existing registration.");
    }
  }
}
