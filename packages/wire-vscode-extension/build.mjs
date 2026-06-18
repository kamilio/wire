import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "out");

export const aliasPlugin = {
  name: "wire-vscode-extension-alias",
  setup(build) {
    const aliases = new Map([
      ["wire-core", join(root, "src/wire-core-node.ts")],
      ["provider-asana", join(root, "../provider-asana/src/index.ts")],
      ["provider-chatgpt", join(root, "../provider-chatgpt/src/index.ts")],
      ["provider-gmail", join(root, "../provider-gmail/src/index.ts")],
      ["provider-google-docs", join(root, "../provider-google-docs/src/index.ts")],
      ["provider-notion", join(root, "../provider-notion/src/index.ts")],
      ["provider-slack", join(root, "../provider-slack/src/index.ts")],
      ["provider-zoom", join(root, "../provider-zoom/src/index.ts")]
    ]);
    build.onResolve({ filter: /.*/ }, (args) => {
      const alias = aliases.get(args.path);
      if (alias === undefined) return;
      return { path: alias };
    });
  }
};

function buildOptions() {
  return {
    entryPoints: [join(root, "src/extension.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: join(out, "extension.js"),
    sourcemap: true,
    external: ["vscode"],
    plugins: [aliasPlugin]
  };
}

export async function buildExtension() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await esbuild.build(buildOptions());
}

export async function watchExtension() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const context = await esbuild.context(buildOptions());
  await context.watch();
  return context;
}

if (process.argv.includes("--watch")) {
  await watchExtension();
  console.log("watching out");
  await new Promise(() => {});
} else {
  await buildExtension();
}
