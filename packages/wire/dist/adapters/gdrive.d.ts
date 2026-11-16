import type { RuntimeCapabilities } from "wire-core";
type DriveRuntime = Pick<RuntimeCapabilities, "googleFormsTokens" | "http">;
export declare function drive(runtime: DriveRuntime, path: string, params: Record<string, string>, init?: RequestInit): Promise<Response>;
export declare function previewDrive(runtime: DriveRuntime, url: string): Promise<string>;
export declare function scrapeDrive(runtime: DriveRuntime, cwd: string, url?: string, deleteVerifiedPdfs?: boolean, deleteVerifiedDocx?: boolean): Promise<string>;
export {};
//# sourceMappingURL=gdrive.d.ts.map