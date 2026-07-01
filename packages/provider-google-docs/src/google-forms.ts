import { defineService } from "wire-core";
import type { FetchedDocument, JsonObject, JsonValue, RuntimeCapabilities, Source } from "wire-core";

type FormAnswer = Readonly<{ questionId: string; text: string }>;

function formId(url: URL): string {
  return /^\/forms(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname)![1]!;
}

function formUrl(id: string): string {
  return `https://docs.google.com/forms/d/${encodeURIComponent(id)}/edit`;
}

function formsAuthError(): Error {
  return new Error("Google Forms API authentication is missing or expired. Set GOOGLE_FORMS_TOKEN_FILE to an OAuth token with Forms scopes, then retry.");
}

function apiDisabledError(body: JsonObject): Error | null {
  const error = body["error"] as JsonObject | undefined;
  if (error === undefined) return null;
  const details = Array.isArray(error["details"]) ? error["details"] as readonly JsonObject[] : [];
  const serviceDisabled = details.find((detail) => {
    const metadata = detail["metadata"] as JsonObject | undefined;
    return metadata !== undefined && metadata["service"] === "forms.googleapis.com";
  });
  if (serviceDisabled === undefined) return null;
  const metadata = serviceDisabled["metadata"] as JsonObject;
  const activationUrl = typeof metadata["activationUrl"] === "string" ? metadata["activationUrl"] : typeof metadata["containerInfo"] === "string" ? `https://console.developers.google.com/apis/api/forms.googleapis.com/overview?project=${metadata["containerInfo"]}` : "https://console.developers.google.com/apis/api/forms.googleapis.com/overview";
  return new Error(`Google Forms API is disabled. Enable it at ${activationUrl} then retry.`);
}

async function formsJson(runtime: RuntimeCapabilities, url: string, label: string): Promise<JsonObject> {
  const token = await runtime.googleFormsTokens.load();
  const response = await runtime.http.request(url, { headers: { authorization: `Bearer ${token.token}` } });
  const text = await response.text();
  const body = text === "" ? {} : JSON.parse(text) as JsonObject;
  if (response.status === 401) throw formsAuthError();
  if (!response.ok) {
    const disabled = apiDisabledError(body);
    if (disabled !== null) throw disabled;
    const error = body["error"] as JsonObject | undefined;
    const message = typeof error?.["message"] === "string" ? error["message"] : text;
    if (response.status === 403 && /insufficient authentication scopes/i.test(message)) throw new Error("Google Forms API token is missing required scopes. Regenerate GOOGLE_FORMS_TOKEN_FILE with forms.body and forms.responses.readonly scopes.");
    throw new Error(`Google Forms API ${label} failed: HTTP ${response.status}${message === "" ? "" : ` ${message}`}`);
  }
  return body;
}

function optionalString(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function jsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionsMarkdown(options: JsonValue | undefined): string | null {
  if (!Array.isArray(options)) return null;
  return options.map((option) => {
    const object = option as JsonObject;
    return object["value"] as string;
  }).join(", ");
}

function questionMarkdown(item: JsonObject): readonly string[] {
  const lines = [`- ${item["title"] as string}`];
  const questionItem = item["questionItem"] as JsonObject | undefined;
  if (questionItem === undefined) return lines;
  const question = questionItem["question"] as JsonObject;
  lines.push(`  - itemId: ${item["itemId"] as string}`);
  lines.push(`  - questionId: ${question["questionId"] as string}`);
  if (question["required"] !== undefined) lines.push(`  - required: ${String(question["required"])}`);
  const textQuestion = question["textQuestion"] as JsonObject | undefined;
  if (textQuestion !== undefined) lines.push(`  - type: ${textQuestion["paragraph"] === true ? "paragraph" : "short_text"}`);
  const choiceQuestion = question["choiceQuestion"] as JsonObject | undefined;
  if (choiceQuestion !== undefined) {
    lines.push(`  - type: ${choiceQuestion["type"] as string}`);
    const options = optionsMarkdown(choiceQuestion["options"]);
    if (options !== null) lines.push(`  - options: ${options}`);
  }
  const scaleQuestion = question["scaleQuestion"] as JsonObject | undefined;
  if (scaleQuestion !== undefined) {
    lines.push("  - type: scale");
    lines.push(`  - range: ${String(scaleQuestion["low"])} to ${String(scaleQuestion["high"])}`);
    const lowLabel = optionalString(scaleQuestion["lowLabel"]);
    const highLabel = optionalString(scaleQuestion["highLabel"]);
    if (lowLabel !== null) lines.push(`  - lowLabel: ${lowLabel}`);
    if (highLabel !== null) lines.push(`  - highLabel: ${highLabel}`);
  }
  if (question["dateQuestion"] !== undefined) lines.push("  - type: date");
  if (question["timeQuestion"] !== undefined) lines.push("  - type: time");
  const ratingQuestion = question["ratingQuestion"] as JsonObject | undefined;
  if (ratingQuestion !== undefined) {
    lines.push("  - type: rating");
    lines.push(`  - level: ${String(ratingQuestion["ratingScaleLevel"])}`);
    lines.push(`  - icon: ${String(ratingQuestion["iconType"])}`);
  }
  if (question["fileUploadQuestion"] !== undefined) lines.push("  - type: file_upload");
  if (question["rowQuestion"] !== undefined) lines.push("  - type: row");
  return lines;
}

function answerTexts(answer: JsonObject): readonly string[] {
  const textAnswers = answer["textAnswers"] as JsonObject | undefined;
  if (textAnswers !== undefined && Array.isArray(textAnswers["answers"])) return (textAnswers["answers"] as readonly JsonObject[]).map((value) => value["value"] as string);
  return [JSON.stringify(answer)];
}

function formAnswers(response: JsonObject): readonly FormAnswer[] {
  const answers = response["answers"] as JsonObject | undefined;
  if (answers === undefined) return [];
  return Object.entries(answers).flatMap(([questionId, answer]) => answerTexts(answer as JsonObject).map((text) => ({ questionId, text })));
}

function formMarkdown(form: JsonObject, responses: readonly JsonObject[]): string {
  const info = form["info"] as JsonObject;
  const title = info["title"] as string;
  const id = form["formId"] as string;
  const lines = [`# ${title}`, "", `- Form ID: ${id}`, `- Edit: ${formUrl(id)}`];
  const responder = optionalString(form["responderUri"]);
  if (responder !== null) lines.push(`- Responder: ${responder}`);
  const publish = (form["publishSettings"] as JsonObject | undefined)?.["publishState"] as JsonObject | undefined;
  if (publish !== undefined) {
    lines.push(`- Published: ${String(publish["isPublished"])}`);
    lines.push(`- Accepting responses: ${String(publish["isAcceptingResponses"])}`);
  }
  lines.push("", "## Items");
  const items = form["items"] as readonly JsonObject[] | undefined;
  if (items === undefined || items.length === 0) lines.push("No items.");
  else for (const item of items) lines.push(...questionMarkdown(item));
  lines.push("", "## Responses", "", `Response count: ${responses.length}`);
  for (const response of responses) {
    lines.push("", `### ${response["responseId"] as string}`);
    const createTime = optionalString(response["createTime"]);
    const submitted = optionalString(response["lastSubmittedTime"]);
    if (createTime !== null) lines.push(`- Created: ${createTime}`);
    if (submitted !== null) lines.push(`- Submitted: ${submitted}`);
    for (const answer of formAnswers(response)) lines.push(`- ${answer.questionId}: ${answer.text}`);
  }
  return `${lines.join("\n")}\n`;
}

async function allResponses(runtime: RuntimeCapabilities, id: string): Promise<readonly JsonObject[]> {
  const responses: JsonObject[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const url = new URL(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}/responses`);
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    const body = await formsJson(runtime, url.toString(), "responses.list");
    if (Array.isArray(body["responses"])) responses.push(...body["responses"] as readonly JsonObject[]);
    if (typeof body["nextPageToken"] !== "string") break;
    pageToken = body["nextPageToken"];
  }
  return responses;
}

async function fetchGoogleForm(runtime: RuntimeCapabilities, source: Source): Promise<FetchedDocument> {
  const form = await formsJson(runtime, `https://forms.googleapis.com/v1/forms/${encodeURIComponent(source.identifier)}`, "forms.get");
  const responses = await allResponses(runtime, source.identifier);
  const info = form["info"] as JsonObject;
  const markdown = formMarkdown(form, responses);
  return Object.freeze({
    title: info["title"] as string,
    markdown,
    data: { form, responses, markdown },
  });
}

export const googleFormsService = defineService<RuntimeCapabilities>({
  name: "google-forms",
  matches: (url) => url.hostname === "docs.google.com" && /^\/forms(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "google-forms", identifier: formId(url), type: "form" }),
  fetch: (runtime, _url, source) => fetchGoogleForm(runtime, source),
  synchronize: async (runtime, _url, source, base, markdown) => {
    const baseMarkdown = jsonObject(base) && typeof base["markdown"] === "string" ? base["markdown"] : null;
    if (baseMarkdown !== null && markdown !== baseMarkdown) throw new Error("Google Forms sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
    return fetchGoogleForm(runtime, source);
  },
});
