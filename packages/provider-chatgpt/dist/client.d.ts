import type { JsonObject, JsonValue, RuntimeCapabilities } from "wire-core";
import { type Cooldown } from "./cooldown.js";
export declare function authError(): Error;
export declare function object(value: JsonValue | undefined): JsonObject;
export declare function text(value: JsonValue | undefined): string | undefined;
export declare class ChatgptRequestError extends Error {
    readonly status: number;
    readonly endpoint: string;
    constructor(status: number, endpoint: string);
}
export declare function connectChatgpt(runtime: RuntimeCapabilities, referer: string, onCooldown?: (value: Cooldown) => Promise<void>): Promise<{
    accountId: string;
    forAccount: (id: string) => {
        id: string;
        json: (endpoint: string) => Promise<JsonValue>;
        bytes: (value: string) => Promise<Uint8Array>;
    };
}>;
export type ChatgptClient = ReturnType<Awaited<ReturnType<typeof connectChatgpt>>["forAccount"]>;
//# sourceMappingURL=client.d.ts.map