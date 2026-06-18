import { createRoot } from "../../dist/adapters/root.js";
import { runWireCli } from "../../dist/cli.js";
import { createFakeWire } from "./fake-wire.mjs";

const auth = Object.freeze({
  status: async (service) => {
    if (process.env.WIRE_FAKE_AUTH_STATUS_ERROR !== undefined) throw new Error(process.env.WIRE_FAKE_AUTH_STATUS_ERROR);
    if (process.env.WIRE_FAKE_AUTH_EMPTY_IDENTITY !== undefined) return { service, identity: {} };
    if (process.env.WIRE_FAKE_AUTH_MESSY_IDENTITY !== undefined && service === "google-docs") return { service, identity: { user: { displayName: "Person\nName", emailAddress: "person\n@example.com", permissionId: "permission\n1" } } };
    if (process.env.WIRE_FAKE_AUTH_MESSY_IDENTITY !== undefined) return { service, identity: { "account\nid": "account\nA1", scopes: ["read\none", "write\ttwo"] } };
    if (process.env.WIRE_FAKE_AUTH_NESTED_IDENTITY !== undefined) return { service, identity: { service, account: { id: "account", plan: "team" }, scopes: ["read", "write"] } };
    return { service, identity: { service } };
  },
  pasteCookies: async (service, contents) => {
    if (process.env.WIRE_FAKE_AUTH_PASTE_ERROR !== undefined) throw new Error(process.env.WIRE_FAKE_AUTH_PASTE_ERROR);
    return { service, identity: { contents } };
  },
  logout: async (service) => ({ service, deleted: true }),
  extractAsana: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "asana" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "asana" ? ({ service: "asana", identity: { saved: true } }) : ({ service: "asana", identity: { gid: "1" } }),
  extractChatgpt: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "chatgpt" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "chatgpt" ? ({ service: "chatgpt", identity: { saved: true } }) : ({ service: "chatgpt", identity: { account_id: "account" } }),
  extractGmail: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "gmail" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "gmail" ? ({ service: "gmail", identity: { saved: true } }) : ({ service: "gmail", identity: { email: "person@example.com" } }),
  extractGoogleDocs: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "google-docs" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "google-docs" ? ({ service: "google-docs", identity: { saved: true } }) : ({ service: "google-docs", identity: { email: "person@example.com" } }),
  extractNotion: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "notion" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "notion" ? ({ service: "notion", identity: { saved: true } }) : ({ service: "notion", identity: { user_id: "user" } }),
  extractSlack: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "slack" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "slack" ? ({ service: "slack", identity: { saved: true } }) : ({ service: "slack", identity: { user_id: "U1" } }),
  extractZoom: async () => process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR !== undefined ? Promise.reject(new Error(process.env.WIRE_FAKE_AUTH_EXTRACT_ERROR)) : process.env.WIRE_FAKE_AUTH_CANCEL_LOGIN === "zoom" ? Promise.reject(new Error("Login not saved")) : process.env.WIRE_FAKE_AUTH_MANUAL_SAVE === "zoom" ? ({ service: "zoom", identity: { saved: true } }) : ({ service: "zoom", identity: { account_id: "A1" } }),
});
function readStandardInput() {
  process.stdin.setEncoding("utf8");
  let contents = "";
  process.stdin.on("data", (chunk) => { contents += chunk; });
  return new Promise((resolve) => { process.stdin.on("end", () => resolve(contents)); });
}
function messyResource(resource) {
  return {
    ...resource,
    id: "notion:page-1\ncontinued",
    urls: ["https://www.notion.so/page-1\ntracking"],
    filesystem_links: [{ path: "Folder\nDocument.md", role: "primary", data: {} }],
    data: [
      { namespace: "wire", key: "title", value: "Document\nSecond\tTab" },
      { namespace: "wire", key: "synced_at", value: "2026-06-10T12:00:00.000Z" },
    ],
  };
}
function messyWatchSession(session) {
  return { ...session, resource: messyResource(session.resource), mode: "two-way\npoll" };
}
function syncOperation(wire) {
  if (process.env.WIRE_FAKE_SYNC_OBJECT_MESSAGE_ERROR !== undefined) return async () => { throw { message: process.env.WIRE_FAKE_SYNC_OBJECT_MESSAGE_ERROR }; };
  if (process.env.WIRE_FAKE_SYNC_OBJECT_ERROR !== undefined) return async () => { throw { error: process.env.WIRE_FAKE_SYNC_OBJECT_ERROR }; };
  if (process.env.WIRE_FAKE_SYNC_ERROR !== undefined) return async () => { throw new Error(process.env.WIRE_FAKE_SYNC_ERROR); };
  return wire.sync;
}
function wireFixture() {
  const wire = createFakeWire();
  return Object.freeze({
    ...wire,
    create: process.env.WIRE_FAKE_CREATE_ERROR === undefined ? wire.create : async () => { throw new Error(process.env.WIRE_FAKE_CREATE_ERROR); },
    sync: syncOperation(wire),
    download: process.env.WIRE_FAKE_DOWNLOAD_ERROR === undefined ? wire.download : async () => { throw new Error(process.env.WIRE_FAKE_DOWNLOAD_ERROR); },
    unlink: process.env.WIRE_FAKE_UNLINK_ERROR === undefined ? wire.unlink : async () => { throw new Error(process.env.WIRE_FAKE_UNLINK_ERROR); },
    view: process.env.WIRE_FAKE_PREVIEW_ERROR === undefined ? wire.view : async () => { throw new Error(process.env.WIRE_FAKE_PREVIEW_ERROR); },
    watch: process.env.WIRE_FAKE_WATCH_ERROR !== undefined ? async () => { throw new Error(process.env.WIRE_FAKE_WATCH_ERROR); } : process.env.WIRE_FAKE_MESSY_RESOURCE === undefined ? wire.watch : async () => messyWatchSession(await wire.watch()),
    listResources: process.env.WIRE_FAKE_LARGE_LIST === undefined ? wire.listResources : async () => {
      const base = await wire.showResource();
      return Array.from({ length: 2000 }, (_value, index) => ({ ...base, id: `notion:page-${index}` }));
    },
    openResource: process.env.WIRE_FAKE_MESSY_RESOURCE === undefined ? wire.openResource : async () => messyResource(await wire.openResource()),
    showResource: process.env.WIRE_FAKE_MESSY_RESOURCE === undefined ? wire.showResource : async () => messyResource(await wire.showResource()),
    syncAll: process.env.WIRE_FAKE_SYNC_ALL_ERROR !== undefined ? async () => { throw new Error(process.env.WIRE_FAKE_SYNC_ALL_ERROR); } : process.env.WIRE_FAKE_SYNC_ALL_FAILED === undefined ? wire.syncAll : async () => {
      const result = (await wire.syncAll())[0];
      return [{ ...result, summary: { ...result.summary, action: "failed", added: 0, modified: 0, removed: 0, error: process.env.WIRE_FAKE_SYNC_ALL_FAILED_ERROR ?? "Remote document disappeared" } }];
    },
  });
}
await runWireCli((currentDirectory) => createRoot(wireFixture(), currentDirectory, auth, readStandardInput), process.argv, "/workspace");
