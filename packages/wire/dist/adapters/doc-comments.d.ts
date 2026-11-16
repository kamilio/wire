import { drive } from "./gdrive.js";
type Runtime = Parameters<typeof drive>[0];
type Reply = {
    author: {
        displayName: string;
    };
    content?: string;
    action?: string;
};
type Thread = Reply & {
    id: string;
    resolved: boolean;
    quotedFileContent?: {
        mimeType: string;
        value: string;
    };
    replies: Reply[];
};
type ListedThread = Thread & {
    url: string;
};
export declare function listDocComments(runtime: Runtime, url: string): Promise<ListedThread[]>;
export declare function formatDocComments(threads: ListedThread[]): string;
export declare function changeDocComment(runtime: Runtime, action: "reply" | "resolve" | "reopen" | "delete-reply", link: string, value?: string): Promise<{
    message: string;
    url: string;
    replyId?: never;
    undo?: never;
} | {
    message: string;
    url: string;
    replyId: string;
    undo: string;
}>;
export {};
//# sourceMappingURL=doc-comments.d.ts.map