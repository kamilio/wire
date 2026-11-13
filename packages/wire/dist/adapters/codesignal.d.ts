import type { FetchedDocument, RuntimeCapabilities } from "wire-core";
export declare const verifyCodeSignal: (token: string) => Promise<{
    service: "codesignal";
    identity: {
        user_id: string;
    };
} | null>;
export declare function codeSignalInterviewId(url: string): string | undefined;
export declare function previewCodeSignal(runtime: RuntimeCapabilities, id: string): Promise<FetchedDocument>;
//# sourceMappingURL=codesignal.d.ts.map