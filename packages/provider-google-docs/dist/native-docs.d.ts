import type { RuntimeCapabilities } from "wire-core";
export declare function nativeDocsGrant(runtime: RuntimeCapabilities, readOnly?: boolean): Promise<{
    token: string;
    driveExport: boolean;
    canWrite: boolean;
} | null>;
export declare function nativeDocMarkdownEqual(left: string, right: string): boolean;
type Element = {
    startIndex?: number;
    endIndex: number;
    paragraph?: {
        paragraphStyle?: {
            namedStyleType?: string;
            headingId?: string;
            [k: string]: unknown;
        };
        bullet?: {
            listId: string;
            nestingLevel?: number;
        };
        elements: {
            textRun?: {
                content: string;
                textStyle?: Record<string, unknown>;
            };
            [k: string]: unknown;
        }[];
        [k: string]: unknown;
    };
};
type Tab = {
    tabProperties: {
        tabId: string;
    };
    childTabs?: Tab[];
    documentTab: {
        body: {
            content: Element[];
        };
        namedRanges?: Record<string, {
            namedRanges?: {
                ranges: {
                    startIndex: number;
                    endIndex: number;
                }[];
            }[];
        }>;
        lists?: Record<string, {
            listProperties: {
                nestingLevels: {
                    glyphType?: string;
                    glyphSymbol?: string;
                    glyphFormat?: string;
                }[];
            };
        }>;
    };
};
export declare function hasDuplicateSlots(md: string): boolean;
type Identity = {
    revision: string;
    tab: string;
    markdown: string;
    slots: string[];
};
export type NativeDocument = {
    documentId?: string;
    revisionId?: string;
    tabs?: Tab[];
};
export declare function captureDuplicateIdentity(data: NativeDocument, id: string, revision: string, tabId: string | null, md: string): Identity;
type DeleteContext = {
    base: string;
    local: string;
    identity: Identity | undefined;
};
export declare function duplicateContext(base: string, local: string, revision: unknown, raw: unknown): DeleteContext;
export declare function alreadyAppliedPlainLabelMove(base: string, local: string, remote: string): boolean;
export declare class StaleDocRevision extends Error {
}
export declare function tryUploadDocBlocks(runtime: RuntimeCapabilities, documentId: string, key: string | null, tabId: string | null, remoteMarkdown: string, desiredMarkdown: string, confirmRemote: (revision: string) => Promise<string>, onWrite?: (revision: string | undefined) => void, positionRevision?: string, context?: DeleteContext, knownDocument?: NativeDocument): Promise<boolean>;
export {};
//# sourceMappingURL=native-docs.d.ts.map