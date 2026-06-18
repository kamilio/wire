import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const bump = process.argv[2];
const versionPath = join(root, "version.json");
const packagePath = join(root, "package.json");
const versionData = JSON.parse(await readFile(versionPath, "utf8"));
const packageData = JSON.parse(await readFile(packagePath, "utf8"));
const parts = versionData.version.split(".").map(Number);

if (bump === "major") {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else if (bump === "minor") {
  parts[1] += 1;
  parts[2] = 0;
} else if (bump === "patch") {
  parts[2] += 1;
} else {
  throw new Error(`Unknown version bump: ${bump}`);
}

const version = parts.join(".");
versionData.version = version;
packageData.version = version;
await writeFile(versionPath, `${JSON.stringify(versionData, null, 2)}\n`);
await writeFile(packagePath, `${JSON.stringify(packageData, null, 2)}\n`);
console.log(version);
