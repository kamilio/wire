import type { RuntimeCapabilities } from "wire-core";
type Cell = {
    formattedValue?: string;
    hyperlink?: string;
    userEnteredValue?: {
        stringValue?: string;
        formulaValue?: string;
    };
    textFormatRuns?: {
        startIndex?: number;
        format?: {
            link?: {
                uri?: string;
            };
        };
    }[];
    userEnteredFormat?: {
        textFormat?: {
            link?: {
                uri?: string;
            };
        };
    };
    chipRuns?: {
        startIndex?: number;
        chip?: {
            richLinkProperties?: {
                uri?: string;
            };
        };
    }[];
};
type Tab = {
    properties: {
        title: string;
    };
    data?: {
        startRow?: number;
        startColumn?: number;
        rowData?: {
            values?: Cell[];
        }[];
    }[];
};
export declare function readSheetTabs(runtime: Pick<RuntimeCapabilities, "googleFormsTokens" | "http">, id: string): Promise<Tab[]>;
export declare function sheetMarkdown(tabs: Tab[]): string;
export {};
//# sourceMappingURL=sheet-markdown.d.ts.map