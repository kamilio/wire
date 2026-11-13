export declare function editDocument(markdown: string, script: string): Promise<{
    edited: string;
    stdout: string;
    stderr: string;
}>;
export declare function documentDiff(from: string, to: string, before: string, after: string): Promise<string>;
//# sourceMappingURL=document-shell.d.ts.map