import type { JsonObject } from "wire-core";
import type { RuntimeCapabilities } from "wire-core";
export declare function markdownToSlackBlocks(markdown: string): readonly JsonObject[];
export declare function slackBlocksToMarkdown(blocks: readonly JsonObject[], users: ReadonlyMap<string, string>): string;
export declare function lookupSlackUsers(runtime: RuntimeCapabilities, query: string): Promise<readonly JsonObject[]>;
export type SlackSentMessage = Readonly<{
    channel: string;
    ts: string;
    url: string;
    thread_ts?: string;
    replies?: readonly SlackSentMessage[];
}>;
export declare function sendSlackMessage(runtime: RuntimeCapabilities, destination: string, markdown: string): Promise<SlackSentMessage>;
export declare function editSlackMessage(runtime: RuntimeCapabilities, url: string, markdown: string): Promise<SlackSentMessage>;
export declare const slackService: Readonly<{
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
    }>, write: import("wire-core").DownloadWriter): Promise<import("wire-core").DownloadedDocument | null>;
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
//# sourceMappingURL=slack.d.ts.map