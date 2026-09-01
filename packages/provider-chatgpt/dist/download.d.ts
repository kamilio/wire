import type { DownloadedDocument, DownloadWriter, JsonObject, RuntimeCapabilities, Source } from "wire-core";
export declare function downloadChatgpt(runtime: RuntimeCapabilities, url: string, source: Source, write: DownloadWriter, render: (conversation: JsonObject) => string): Promise<DownloadedDocument | null>;
//# sourceMappingURL=download.d.ts.map