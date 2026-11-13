import type { RuntimeCapabilities } from "wire-core";
export declare const zoomHubService: Readonly<{
    name: string;
    matches(url: URL): boolean;
    parse(url: URL): import("wire-core").Source;
    fetch(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: import("wire-core").JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>): Promise<Readonly<{
        title: string;
        markdown: string;
        data: import("wire-core").JsonValue;
    }>>;
    download?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: import("wire-core").JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, write: import("wire-core").DownloadWriter, addMarkdown?: import("wire-core").AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: import("wire-core").JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string): Promise<import("wire-core").SynchronizedDocument>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
export declare function scrapeZoom(runtime: RuntimeCapabilities, directory: string): Promise<{
    downloaded: number;
    unchanged: number;
    unavailable: number;
    locallyModified: number;
}>;
//# sourceMappingURL=zoom-hub.d.ts.map