export { latticeReviewDraft, listLatticeReviewRequests, syncLatticeDrafts } from "./draft.js";
import { type AddMarkdown, type RuntimeCapabilities } from "wire-core";
export declare const latticeService: Readonly<{
    name: string;
    owner?: string;
    supportsEditorReceipts?: boolean;
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
    }>, write: import("wire-core").DownloadWriter, addMarkdown?: AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
    mergeDrafts?(base: string, editor: string, shell: string): string;
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: import("wire-core").JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
        title: string;
        markdown: string;
        data: import("wire-core").JsonValue;
    }>) => void | Promise<void>, requireConditionalWrite?: boolean, expectedFile?: string): Promise<import("wire-core").SynchronizedDocument>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
export declare const latticeProvider: Readonly<{
    services: readonly [Readonly<{
        name: string;
        owner?: string;
        supportsEditorReceipts?: boolean;
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
        }>, write: import("wire-core").DownloadWriter, addMarkdown?: AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
        mergeDrafts?(base: string, editor: string, shell: string): string;
        synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
            title: string;
            markdown: string;
            data: import("wire-core").JsonValue;
        }>) => void | Promise<void>, requireConditionalWrite?: boolean, expectedFile?: string): Promise<import("wire-core").SynchronizedDocument>;
        upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
    }>];
}>;
//# sourceMappingURL=index.d.ts.map