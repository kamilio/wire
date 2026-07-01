import type { JsonValue, RuntimeCapabilities, Source } from "wire-core";
export declare const googleFormsService: Readonly<{
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
    synchronize?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, base: JsonValue, markdown: string, markdownPath: string): Promise<Readonly<{
        title: string;
        markdown: string;
        data: JsonValue;
    }>>;
    upload?(input: RuntimeCapabilities, markdown: string, markdownPath: string): Promise<import("wire-core").UploadedDocument>;
}>;
//# sourceMappingURL=google-forms.d.ts.map