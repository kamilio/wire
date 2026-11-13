export declare function docBlocks(markdown: string): string[];
type Change = {
    start: number;
    end: number;
    replacement: string[];
};
export declare function docChanges(base: readonly string[], side: readonly string[]): Change[];
export declare function mergeDocBlocks(base: string, local: string, remote: string, sameRendering?: (local: string, remote: string) => boolean): string;
export {};
//# sourceMappingURL=doc-blocks.d.ts.map