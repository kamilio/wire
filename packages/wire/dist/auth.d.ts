import { type ChromeCookieExtraction, type ChromeCookieResult, type NodeEnvironment, type RuntimeCapabilities } from "wire-core";
export type AuthService = "ashby" | "asana" | "chatgpt" | "codesignal" | "gmail" | "google-docs" | "notion" | "slack" | "zoom";
export type CookieAuthService = AuthService;
export interface AuthResult {
    readonly service: AuthService;
    readonly identity: Readonly<Record<string, unknown>>;
}
export interface Auth {
    readonly status: (service: AuthService) => Promise<AuthResult>;
    readonly pasteCookies: (service: AuthService, contents: string) => Promise<AuthResult>;
    readonly logout: (service: AuthService) => Promise<{
        readonly service: AuthService;
        readonly deleted: true;
    }>;
    readonly extractAshby: () => Promise<AuthResult>;
    readonly extractAsana: () => Promise<AuthResult>;
    readonly extractChatgpt: () => Promise<AuthResult>;
    readonly extractCodeSignal: () => Promise<AuthResult>;
    readonly extractGmail: () => Promise<AuthResult>;
    readonly extractGoogleDocs: () => Promise<AuthResult>;
    readonly extractNotion: () => Promise<AuthResult>;
    readonly extractSlack: () => Promise<AuthResult>;
    readonly extractZoom: () => Promise<AuthResult>;
}
export type CookieExtractor = (environment: NodeEnvironment, extraction: ChromeCookieExtraction) => Promise<ChromeCookieResult>;
export declare function composeAuth(runtime: RuntimeCapabilities, environment: NodeEnvironment, extractCookies: CookieExtractor): Auth;
//# sourceMappingURL=auth.d.ts.map