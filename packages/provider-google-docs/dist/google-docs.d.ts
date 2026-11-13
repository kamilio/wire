import type { JsonValue, RuntimeCapabilities, Source, SynchronizedDocument } from "wire-core";
export declare function googleDocOriginalImages(bytes: Uint8Array): {
    data: Uint8Array<ArrayBufferLike>;
    ext: string;
    alt: string | undefined;
    style: string;
    frame: string;
}[];
export declare function googleDocListMarkdown(markdown: string, wordExport: () => Promise<Uint8Array>): Promise<string>;
export declare const googleDocsService: Readonly<{
    name: string;
    matches(url: URL): boolean;
    parse(url: URL): Source;
    fetch(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>): Promise<Readonly<{
        title: string;
        markdown: string;
        data: JsonValue;
    }>>;
    download?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, write: import("wire-core").DownloadWriter, addMarkdown?: import("wire-core").AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
        title: string;
        markdown: string;
        data: JsonValue;
    }>) => void, requireConditionalWrite?: boolean): Promise<SynchronizedDocument>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
//# sourceMappingURL=google-docs.d.ts.map