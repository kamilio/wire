import type { RuntimeCapabilities } from "wire-core";
export declare const notionService: Readonly<{
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
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: import("wire-core").JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: import("wire-core").JsonValue, markdown: string, markdownPath: string): Promise<Readonly<{
        title: string;
        markdown: string;
        data: import("wire-core").JsonValue;
    }>>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
//# sourceMappingURL=notion.d.ts.map