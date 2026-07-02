import type { Cookie } from "../ports.js";
import type { NodeEnvironment } from "./node.js";
export declare function chromeUserDataDir(environment: NodeEnvironment): string;
export declare function chromeLaunchArguments(environment: NodeEnvironment, startUrl: string): Promise<readonly string[]>;
export interface ChromeCookieExtraction {
    readonly service: string;
    readonly startUrl: string;
    readonly domains: readonly string[];
    readonly ready: (cookies: readonly Cookie[]) => boolean;
    readonly metadataExpression?: string;
    readonly freshSession?: true;
    readonly verify: (cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>) => Promise<boolean>;
}
export interface ChromeCookieResult {
    readonly cookies: readonly Cookie[];
    readonly metadata: Readonly<Record<string, string>>;
    readonly manual?: true;
}
export declare function extractChromeCookies(environment: NodeEnvironment, extraction: ChromeCookieExtraction): Promise<ChromeCookieResult>;
//# sourceMappingURL=chrome.d.ts.map