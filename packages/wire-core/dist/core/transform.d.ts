import type { JsonObject, ServiceCatalog } from "./model.js";
export type SlackMessage = Readonly<{
    ts: string;
    text: string;
}>;
export type GmailMimePart = Readonly<{
    mimeType: string;
    body?: Readonly<{
        data: string;
    }>;
    parts?: readonly GmailMimePart[];
}>;
export type AsanaTask = Readonly<{
    name: string;
    permalink_url: string;
    completed: boolean;
    assignee: Readonly<{
        name: string;
    }> | null;
    notes: string;
}>;
export type AsanaStory = Readonly<{
    created_at: string;
    created_by: Readonly<{
        name: string;
    }>;
    text: string;
}>;
export declare function markdownFilename(title: string): string;
export declare function slackTitle(messages: readonly SlackMessage[], timeZone: string): string;
export declare function slackText(text: string, userCache: Readonly<Record<string, string>>): string;
export declare function gmailMessageBody(payload: GmailMimePart): string;
export declare function formatAsanaTask(task: AsanaTask, stories: readonly AsanaStory[]): string;
export declare function extractRelationships<FetchInput>(markdown: string, currentId: string, catalog: ServiceCatalog<FetchInput>): readonly Readonly<{
    target_id: string;
    type: "references";
    data: JsonObject;
}>[];
//# sourceMappingURL=transform.d.ts.map