import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createNodeRuntime, fetchSource, serviceCatalog } from "../dist/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const environment = { ...process.env, WIRE_REPOSITORY_ROOT: repositoryRoot };
const configured = {
  "zoom-hub": environment.WIRE_LIVE_ZOOM_HUB_URL,
  notion: environment.WIRE_LIVE_NOTION_URL,
  slack: environment.WIRE_LIVE_SLACK_URL,
  "google-docs-document": environment.WIRE_LIVE_GOOGLE_DOCS_URL,
  "google-docs-sheet": environment.WIRE_LIVE_GOOGLE_SHEETS_URL,
  "google-forms": environment.WIRE_LIVE_GOOGLE_FORMS_URL,
  gmail: environment.WIRE_LIVE_GMAIL_URL,
  "asana-task": environment.WIRE_LIVE_ASANA_TASK_URL,
  "asana-project": environment.WIRE_LIVE_ASANA_PROJECT_URL,
};

const requested = environment.WIRE_LIVE_SERVICES?.split(",").filter((value) => value !== "") ?? [];
const services = new Set([...Object.entries(configured).filter(([, url]) => url !== undefined && url !== "").map(([name]) => name), ...requested]);
for (const name of services) {
  test(`live parity: ${name}`, async () => {
    const url = configured[name];
    assert.ok(url, `WIRE_LIVE_SERVICES includes ${name}, but its WIRE_LIVE_*_URL is not configured`);
    const runtime = createNodeRuntime(environment);
    const document = await fetchSource(runtime, url, serviceCatalog);
    assert.equal(typeof document.title, "string");
    assert.equal(typeof document.markdown, "string");
    assert.equal(document.title.length > 0, true);
    assert.equal(document.markdown.length > 0, true);
  });
}
