import type { Wire } from "wire-core";
export type WireHookEvent = "post-resource" | "post-batch" | "post-command";
export type WireHookOptions = Readonly<{
    currentDirectory: string;
    home: string;
    environment: Readonly<Record<string, string | undefined>>;
}>;
export declare function withWireHooks(wire: Wire, options: WireHookOptions): Wire;
//# sourceMappingURL=hooks.d.ts.map