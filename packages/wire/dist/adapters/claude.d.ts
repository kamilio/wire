import type { ProcessCapability } from "wire-core";
type Summary = {
    uuid: string;
    name: string;
    created_at: string;
    updated_at: string;
};
type Message = {
    sender: string;
    text: string;
    content: {
        type: string;
        text?: string;
    }[];
    attachments: {
        file_name: string;
    }[];
    files: {
        file_name: string;
    }[];
};
type Chat = Summary & {
    chat_messages: Message[];
};
export declare function claudeMarkdown(chat: Chat): string;
export declare function scrapeClaude(process: ProcessCapability, directory: string): Promise<string>;
export {};
//# sourceMappingURL=claude.d.ts.map