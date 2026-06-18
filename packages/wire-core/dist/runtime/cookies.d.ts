import type { Cookie, CookiesCapability, FilesystemCapability } from "../ports.js";
export type CookieTextFormat = "netscape" | "header" | "json";
export declare function parseNetscapeCookies(contents: string): readonly Cookie[];
export declare function detectCookieFormat(contents: string): CookieTextFormat;
export declare function parseCookieHeader(contents: string, domain: string): readonly Cookie[];
export declare function parseJsonCookies(contents: string, domain: string): readonly Cookie[];
export declare function parsePastedCookies(contents: string, domain: string): readonly Cookie[];
export declare function parseCookieMetadata(contents: string): Readonly<Record<string, string>>;
export declare function parsePastedCookieMetadata(contents: string): Readonly<Record<string, string>>;
export declare function cookiesDirectory(home: string): string;
export declare function cookiesFile(home: string, service: string): string;
export declare function repositoryCookiesFile(repositoryRoot: string, service: string): string;
export declare function serializeNetscapeCookies(cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>): string;
export declare function createCookiesCapability(filesystem: FilesystemCapability, home: () => string, repositoryRoot?: () => string | undefined, overrideFile?: (service: string) => string | undefined): CookiesCapability;
//# sourceMappingURL=cookies.d.ts.map