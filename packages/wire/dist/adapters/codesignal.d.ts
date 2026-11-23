import type { FetchedDocument, RuntimeCapabilities } from "wire-core";
export declare const verifyCodeSignal: (token: string) => Promise<{
    service: "codesignal";
    identity: {
        user_id: string;
    };
} | null>;
export declare function codeSignalInterviewId(url: string): string | undefined;
export declare function previewCodeSignal(runtime: RuntimeCapabilities, id: string): Promise<FetchedDocument>;
export declare function editCodeSignal(runtime: RuntimeCapabilities, url: string, path: string, source: string): Promise<{
    url: string;
    path: string;
}>;
export declare function runCodeSignal(runtime: RuntimeCapabilities, url: string): Promise<{
    verdict: string;
    output: string;
    compilationLog: string;
    runTime: number;
}>;
//# sourceMappingURL=codesignal.d.ts.map