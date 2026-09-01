import type { HttpCapability } from "wire-core";
export type Cooldown = {
    endpoint: string;
    status: number;
    attempt: number;
    delay_ms: number;
    retry_at: string;
    source: "retry-after-seconds" | "retry-after-date" | "exponential-backoff";
};
export declare class ChatgptCooldownError extends Error {
    readonly cooldown: Cooldown;
    constructor(cooldown: Cooldown);
}
export declare function responseCooldown(response: Response, now: number, attempt: number, endpoint: string): Cooldown;
export declare function createChatgptRequester(http: HttpCapability, onCooldown?: (value: Cooldown) => Promise<void>, timing?: {
    now: () => number;
    sleep: (milliseconds: number) => Promise<void>;
}): (url: string, headers: Record<string, string>, endpoint: string) => Promise<Response>;
//# sourceMappingURL=cooldown.d.ts.map