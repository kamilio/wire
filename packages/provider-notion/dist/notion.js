import { defineService } from "wire-core";
import { fetchNotionDocument, synchronizeNotionDocument, uploadNotionDocument } from "./notion-sync.js";
const notionPageId = /[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
export const notionService = defineService({
    name: "notion",
    matches: (url) => (url.hostname === "www.notion.so" || url.hostname === "notion.so" || url.hostname === "app.notion.com" || url.hostname.endsWith(".notion.site")) && notionPageId.test(url.href),
    parse: (url) => Object.freeze({ service: "notion", identifier: notionPageId.exec(url.href)[0].replaceAll("-", "").toLowerCase(), type: "document" }),
    fetch: fetchNotionDocument,
    synchronize: (runtime, url, _source, base, markdown, markdownPath) => synchronizeNotionDocument(runtime, url, base, markdown, markdownPath),
    upload: uploadNotionDocument,
});
//# sourceMappingURL=notion.js.map