import type { JsonValue, RuntimeCapabilities, Source } from "wire-core";
export declare const googleFormsService: Readonly<{
    name: string;
    owner?: string;
    supportsEditorReceipts?: boolean;
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
    mergeDrafts?(base: string, editor: string, shell: string): string;
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: JsonValue, markdown: string, markdownPath: string, observeRemote?: (remote: Readonly<{
        title: string;
        markdown: string;
        data: JsonValue;
    }>) => void | Promise<void>, requireConditionalWrite?: boolean, expectedFile?: string): Promise<import("wire-core").SynchronizedDocument>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
//# sourceMappingURL=google-forms.d.ts.map