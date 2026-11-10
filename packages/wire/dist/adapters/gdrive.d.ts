import type { RuntimeCapabilities } from "wire-core";
type DriveRuntime = Pick<RuntimeCapabilities, "googleFormsTokens" | "http">;
export declare function previewDrive(runtime: DriveRuntime, url: string): Promise<string>;
export declare function scrapeDrive(runtime: DriveRuntime, cwd: string, url?: string): Promise<string>;
export {};
//# sourceMappingURL=gdrive.d.ts.map