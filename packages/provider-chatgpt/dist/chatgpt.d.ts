import type { JsonValue } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
export declare const chatgptService: Readonly<{
    name: string;
    matches(url: URL): boolean;
    parse(url: URL): import("wire-core").Source;
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
//# sourceMappingURL=chatgpt.d.ts.map