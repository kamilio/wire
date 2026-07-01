import { defineService } from "wire-core";
function formId(url) {
    return /^\/forms(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname)[1];
}
function formUrl(id) {
    return `https://docs.google.com/forms/d/${encodeURIComponent(id)}/edit`;
}
function formsAuthError() {
    return new Error("Google Forms API authentication is missing or expired. Set GOOGLE_FORMS_TOKEN_FILE to an OAuth token with Forms scopes, then retry.");
}
function apiDisabledError(body) {
    const error = body["error"];
    if (error === undefined)
        return null;
    const details = Array.isArray(error["details"]) ? error["details"] : [];
    const serviceDisabled = details.find((detail) => {
        const metadata = detail["metadata"];
        return metadata !== undefined && metadata["service"] === "forms.googleapis.com";
    });
    if (serviceDisabled === undefined)
        return null;
    const metadata = serviceDisabled["metadata"];
    const activationUrl = typeof metadata["activationUrl"] === "string" ? metadata["activationUrl"] : typeof metadata["containerInfo"] === "string" ? `https://console.developers.google.com/apis/api/forms.googleapis.com/overview?project=${metadata["containerInfo"]}` : "https://console.developers.google.com/apis/api/forms.googleapis.com/overview";
    return new Error(`Google Forms API is disabled. Enable it at ${activationUrl} then retry.`);
}
async function formsJson(runtime, url, label) {
    const token = await runtime.googleFormsTokens.load();
    const response = await runtime.http.request(url, { headers: { authorization: `Bearer ${token.token}` } });
    const text = await response.text();
    const body = text === "" ? {} : JSON.parse(text);
    if (response.status === 401)
        throw formsAuthError();
    if (!response.ok) {
        const disabled = apiDisabledError(body);
        if (disabled !== null)
            throw disabled;
        const error = body["error"];
        const message = typeof error?.["message"] === "string" ? error["message"] : text;
        if (response.status === 403 && /insufficient authentication scopes/i.test(message))
            throw new Error("Google Forms API token is missing required scopes. Regenerate GOOGLE_FORMS_TOKEN_FILE with forms.body and forms.responses.readonly scopes.");
        throw new Error(`Google Forms API ${label} failed: HTTP ${response.status}${message === "" ? "" : ` ${message}`}`);
    }
    return body;
}
function optionalString(value) {
    return typeof value === "string" && value !== "" ? value : null;
}
function jsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionsMarkdown(options) {
    if (!Array.isArray(options))
        return null;
    return options.map((option) => {
        const object = option;
        return object["value"];
    }).join(", ");
}
function questionMarkdown(item) {
    const lines = [`- ${item["title"]}`];
    const questionItem = item["questionItem"];
    if (questionItem === undefined)
        return lines;
    const question = questionItem["question"];
    lines.push(`  - itemId: ${item["itemId"]}`);
    lines.push(`  - questionId: ${question["questionId"]}`);
    if (question["required"] !== undefined)
        lines.push(`  - required: ${String(question["required"])}`);
    const textQuestion = question["textQuestion"];
    if (textQuestion !== undefined)
        lines.push(`  - type: ${textQuestion["paragraph"] === true ? "paragraph" : "short_text"}`);
    const choiceQuestion = question["choiceQuestion"];
    if (choiceQuestion !== undefined) {
        lines.push(`  - type: ${choiceQuestion["type"]}`);
        const options = optionsMarkdown(choiceQuestion["options"]);
        if (options !== null)
            lines.push(`  - options: ${options}`);
    }
    const scaleQuestion = question["scaleQuestion"];
    if (scaleQuestion !== undefined) {
        lines.push("  - type: scale");
        lines.push(`  - range: ${String(scaleQuestion["low"])} to ${String(scaleQuestion["high"])}`);
        const lowLabel = optionalString(scaleQuestion["lowLabel"]);
        const highLabel = optionalString(scaleQuestion["highLabel"]);
        if (lowLabel !== null)
            lines.push(`  - lowLabel: ${lowLabel}`);
        if (highLabel !== null)
            lines.push(`  - highLabel: ${highLabel}`);
    }
    if (question["dateQuestion"] !== undefined)
        lines.push("  - type: date");
    if (question["timeQuestion"] !== undefined)
        lines.push("  - type: time");
    const ratingQuestion = question["ratingQuestion"];
    if (ratingQuestion !== undefined) {
        lines.push("  - type: rating");
        lines.push(`  - level: ${String(ratingQuestion["ratingScaleLevel"])}`);
        lines.push(`  - icon: ${String(ratingQuestion["iconType"])}`);
    }
    if (question["fileUploadQuestion"] !== undefined)
        lines.push("  - type: file_upload");
    if (question["rowQuestion"] !== undefined)
        lines.push("  - type: row");
    return lines;
}
function answerTexts(answer) {
    const textAnswers = answer["textAnswers"];
    if (textAnswers !== undefined && Array.isArray(textAnswers["answers"]))
        return textAnswers["answers"].map((value) => value["value"]);
    return [JSON.stringify(answer)];
}
function formAnswers(response) {
    const answers = response["answers"];
    if (answers === undefined)
        return [];
    return Object.entries(answers).flatMap(([questionId, answer]) => answerTexts(answer).map((text) => ({ questionId, text })));
}
function formMarkdown(form, responses) {
    const info = form["info"];
    const title = info["title"];
    const id = form["formId"];
    const lines = [`# ${title}`, "", `- Form ID: ${id}`, `- Edit: ${formUrl(id)}`];
    const responder = optionalString(form["responderUri"]);
    if (responder !== null)
        lines.push(`- Responder: ${responder}`);
    const publish = form["publishSettings"]?.["publishState"];
    if (publish !== undefined) {
        lines.push(`- Published: ${String(publish["isPublished"])}`);
        lines.push(`- Accepting responses: ${String(publish["isAcceptingResponses"])}`);
    }
    lines.push("", "## Items");
    const items = form["items"];
    if (items === undefined || items.length === 0)
        lines.push("No items.");
    else
        for (const item of items)
            lines.push(...questionMarkdown(item));
    lines.push("", "## Responses", "", `Response count: ${responses.length}`);
    for (const response of responses) {
        lines.push("", `### ${response["responseId"]}`);
        const createTime = optionalString(response["createTime"]);
        const submitted = optionalString(response["lastSubmittedTime"]);
        if (createTime !== null)
            lines.push(`- Created: ${createTime}`);
        if (submitted !== null)
            lines.push(`- Submitted: ${submitted}`);
        for (const answer of formAnswers(response))
            lines.push(`- ${answer.questionId}: ${answer.text}`);
    }
    return `${lines.join("\n")}\n`;
}
async function allResponses(runtime, id) {
    const responses = [];
    let pageToken;
    for (;;) {
        const url = new URL(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}/responses`);
        if (pageToken !== undefined)
            url.searchParams.set("pageToken", pageToken);
        const body = await formsJson(runtime, url.toString(), "responses.list");
        if (Array.isArray(body["responses"]))
            responses.push(...body["responses"]);
        if (typeof body["nextPageToken"] !== "string")
            break;
        pageToken = body["nextPageToken"];
    }
    return responses;
}
async function fetchGoogleForm(runtime, source) {
    const form = await formsJson(runtime, `https://forms.googleapis.com/v1/forms/${encodeURIComponent(source.identifier)}`, "forms.get");
    const responses = await allResponses(runtime, source.identifier);
    const info = form["info"];
    const markdown = formMarkdown(form, responses);
    return Object.freeze({
        title: info["title"],
        markdown,
        data: { form, responses, markdown },
    });
}
export const googleFormsService = defineService({
    name: "google-forms",
    matches: (url) => url.hostname === "docs.google.com" && /^\/forms(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
    parse: (url) => Object.freeze({ service: "google-forms", identifier: formId(url), type: "form" }),
    fetch: (runtime, _url, source) => fetchGoogleForm(runtime, source),
    synchronize: async (runtime, _url, source, base, markdown) => {
        const baseMarkdown = jsonObject(base) && typeof base["markdown"] === "string" ? base["markdown"] : null;
        if (baseMarkdown !== null && markdown !== baseMarkdown)
            throw new Error("Google Forms sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
        return fetchGoogleForm(runtime, source);
    },
});
//# sourceMappingURL=google-forms.js.map