const resource = Object.freeze({
  id: "notion:page-1",
  type: "document",
  identifiers: [{ service: "notion", identifier: "page-1" }],
  urls: ["https://www.notion.so/page-1"],
  filesystem_links: [{ path: "Document.md", role: "primary", data: {} }],
  data: [
    { namespace: "wire", key: "title", value: "Document" },
    { namespace: "wire", key: "synced_at", value: "2026-06-10T12:00:00.000Z" },
  ],
  relationships: [],
});
const result = Object.freeze({ resource, path: "/workspace/Document.md", markdown: "# Document\n", summary: { action: "created", added: 1, modified: 0, removed: 0, remote: "https://www.notion.so/page-1", local: "/workspace/Document.md" } });
const downloadedResult = Object.freeze({ ...result, summary: { ...result.summary, action: "downloaded" } });
const unlinkedResult = Object.freeze({ ...result, summary: { ...result.summary, action: "unlinked" } });

export function createFakeWire() {
  return Object.freeze({
    init: async (path, backend, registryPath) => {
      if (process.env.WIRE_FAKE_INIT_ERROR !== undefined) throw new Error(process.env.WIRE_FAKE_INIT_ERROR);
      return { root: `${path}/.wire`, backend, path: registryPath, created: true };
    },
    create: async () => result,
    view: async () => ({ title: "Document", markdown: "# Document\n", data: { page_id: "page-1" } }),
    sync: async () => downloadedResult,
    download: async () => downloadedResult,
    unlink: async () => unlinkedResult,
    watch: async () => ({ resource, path: result.path, mode: "two-way", debounceMs: 1000, pollMs: 60000, closed: Promise.resolve(), close: () => {} }),
    openResource: async () => resource,
    syncAll: async () => [downloadedResult],
    listResources: async () => [resource],
    showResource: async () => resource,
    switchBackend: async () => {
      if (process.env.WIRE_FAKE_SWITCH_DB_ERROR !== undefined) throw new Error(process.env.WIRE_FAKE_SWITCH_DB_ERROR);
      return { root: "/workspace/.wire", from: "sqlite", to: "files", fromPath: "/workspace/.wire/registry.sqlite3", toPath: "/workspace/.wire/records", resources: 1 };
    },
  });
}

export { resource, result, downloadedResult, unlinkedResult };
