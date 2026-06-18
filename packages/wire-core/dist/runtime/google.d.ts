import type { ClockCapability, FilesystemCapability, GoogleTokenDocument, GoogleTokensCapability, HttpCapability } from "../ports.js";
interface GoogleClientCredentials {
    readonly client_id: string;
    readonly client_secret: string;
    readonly token_uri: string;
}
interface GoogleRefreshResponse {
    readonly access_token: string;
    readonly expires_in: number;
    readonly refresh_token?: string;
    readonly scope?: string;
    readonly token_type?: string;
    readonly id_token?: string;
}
export declare function parseGoogleCredentials(contents: string): GoogleClientCredentials;
export declare function parseGoogleToken(contents: string): GoogleTokenDocument;
export declare function googleTokenExpired(token: GoogleTokenDocument, now: Date): boolean;
export declare function mergeGoogleRefresh(token: GoogleTokenDocument, refresh: GoogleRefreshResponse, now: Date): GoogleTokenDocument;
export declare function createGoogleTokensCapability(filesystem: FilesystemCapability, http: HttpCapability, clock: ClockCapability, credentialsPath: string, tokenPath: string): GoogleTokensCapability;
export {};
//# sourceMappingURL=google.d.ts.map