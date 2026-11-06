import type { JsonObject, JsonValue } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
export declare const asanaTaskService: Readonly<{
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
    download?(input: RuntimeCapabilities, url: string, source: Readonly<{
        [key: string]: JsonValue;
        service: string;
        identifier: string;
        type: import("wire-core").ResourceType;
    }>, write: import("wire-core").DownloadWriter): Promise<import("wire-core").DownloadedDocument | null>;
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
export declare function showAsanaTask(runtime: RuntimeCapabilities, identifier: string): Promise<Readonly<{
    title: string;
    markdown: `${string}
`;
    data: {
        task: {
            body_markdown: string;
        };
        stories: Readonly<{
            [key: string]: JsonValue;
        }>[];
    };
}>>;
export declare function editAsanaTask(runtime: RuntimeCapabilities, task: string, fields: JsonObject): Promise<JsonObject>;
export declare function addAsanaComment(runtime: RuntimeCapabilities, task: string, body: string): Promise<JsonObject>;
export declare function editAsanaComment(runtime: RuntimeCapabilities, comment: string, body: string): Promise<JsonObject>;
//# sourceMappingURL=asana-task.d.ts.map