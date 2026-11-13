export { chatgptService } from "./chatgpt.js";
export declare const chatgptProvider: Readonly<{
    services: readonly [Readonly<{
        name: string;
        owner?: string;
        supportsEditorReceipts?: boolean;
        matches(url: URL): boolean;
        parse(url: URL): import("wire-core").Source;
        fetch(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>): Promise<Readonly<{
            title: string;
            markdown: string;
            data: import("wire-core").JsonValue;
        }>>;
        download?(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>, write: import("wire-core").DownloadWriter, addMarkdown?: import("wire-core").AddMarkdown): Promise<import("wire-core").DownloadedDocument | null>;
        mergeDrafts?(base: string, editor: string, shell: string): string;
        synchronize?(input: import("wire-core").RuntimeCapabilities, url: string, source: Readonly<{
            [key: string]: import("wire-core").JsonValue;
            service: string;
            identifier: string;
            type: import("wire-core").ResourceType;
        }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
            title: string;
            markdown: string;
            data: import("wire-core").JsonValue;
        }>) => void | Promise<void>, requireConditionalWrite?: boolean, expectedFile?: string): Promise<import("wire-core").SynchronizedDocument>;
        upload?(input: import("wire-core").RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
    }>];
}>;
//# sourceMappingURL=index.d.ts.map