import type { WireRoot } from "./adapters/root.js";
export type WireRootFactory = (currentDirectory: string) => WireRoot;
export declare function runWireCli(root: WireRoot | WireRootFactory, argv: readonly string[], currentDirectory: string): Promise<void>;
//# sourceMappingURL=cli.d.ts.map