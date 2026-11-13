import { cloudflareWorkerLimits, createMemoryFileSystem, diffCommands, Shell, standardCommands, textProgramCommands } from "#document-shell-engine";

const encoder = new TextEncoder();
const documentPath = "/document.md";

function memoryFilesystem() {
  return createMemoryFileSystem({ maxBytes: 32 * 1024 * 1024, maxFileBytes: 8 * 1024 * 1024, maxRetainedBytes: 64 * 1024 * 1024, maxMetadataUnits: 524288 });
}

export async function editDocument(markdown: string, script: string) {
  const fs = memoryFilesystem();
  await fs.writeFile(documentPath, encoder.encode(markdown));
  const shell = new Shell({ fs, cwd: "/", limits: cloudflareWorkerLimits }).use(standardCommands()).use(textProgramCommands()).use(diffCommands());
  try {
    const { exitCode, stdout, stderr } = await shell.exec(script);
    if (exitCode !== 0) throw new Error(`Shell exited ${exitCode}; no changes saved.\n${[stdout, stderr].filter(Boolean).join("\n")}`.trimEnd());
    const stat = await fs.lstat(documentPath).catch(() => undefined);
    if (stat?.type !== "file") throw new Error("Keep /document.md as a regular file; no changes saved.");
    const bytes = await fs.readFile(documentPath);
    if (bytes.includes(0)) throw new Error("/document.md must contain UTF-8 text; no changes saved.");
    let edited: string;
    try { edited = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new Error("/document.md must contain UTF-8 text; no changes saved."); }
    return { edited, stdout, stderr };
  } finally {
    await shell.dispose();
  }
}

export async function documentDiff(from: string, to: string, before: string, after: string): Promise<string> {
  if (before === after) return "";
  const fs = memoryFilesystem();
  await fs.writeFile("/a", encoder.encode(before));
  await fs.writeFile("/b", encoder.encode(after));
  const shell = new Shell({ fs, cwd: "/", limits: cloudflareWorkerLimits }).use(diffCommands());
  try {
    const result = await shell.exec('diff -u -L "$FROM" -L "$TO" /a /b', { env: { FROM: from, TO: to } });
    if (result.exitCode > 1) throw new Error(result.stderr || "Could not compare documents.");
    return result.stdout;
  } finally {
    await shell.dispose();
  }
}
