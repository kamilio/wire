import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { decodeHTML } from "entities";
import { browser } from "./browser.js";
import { richText } from "./markdown.js";
const uuid = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
function target(input, individual) {
    const url = new URL(input);
    const route = individual ? "response/(" + uuid + ")" : "requests";
    const m = new RegExp("^/reviews/(" + uuid + ")/participant/" + route + "/?$", "i").exec(url.pathname);
    if (url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !/^[a-z0-9-]+\.latticehq\.com$/.test(url.hostname) ||
        !m)
        throw Error("Expected a Lattice participant " + (individual ? "response" : "requests") + " URL.");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    return { url, cycle: m[1], request: m[2] };
}
const fields = `($id:String!){viewer{r:findReviewRequest(reviewRequestId:$id){entityId viewerIsResponder status submittedAt lockedAt closedAt isRejected reviewee{user{name} reviewCycle{entityId name canReviewsBeWritten}} reviewGroup{type reviewTemplate{name instructions wordCountLimit}} questions:reviewRequestQuestions{id description isPrivate reviewResponse{content} revision:questionRevisionV2{__typename body ... on RatingQuestionRevisionInterface{scale} ... on MultipleChoiceQuestionRevision{choices} ... on MultipleChoiceAndBodyQuestionRevision{choices} ... on MultipleSelectQuestionRevision{choices} ... on MultipleSelectAndBodyQuestionRevision{choices} question{... on ReviewCycleQuestionInterface{isOptional} ... on MultipleSelectQuestion{maximumSelection} ... on MultipleSelectAndBodyQuestion{maximumSelection isBodyOptional isMultipleSelectOptional} ... on MultipleChoiceAndBodyQuestion{isBodyOptional isMultipleChoiceOptional} ... on RatingAndBodyQuestion{isBodyOptional isRatingOptional}}}}}}}`;
const norm = (s) => s.trim().replace(/\s+/g, " ");
const heading = (q) => norm(richText(q.revision.body));
const guide = (s) => s
    .split(/\r?\n/)
    .map((l) => "> " + l)
    .join("\n");
function intro(r, url) {
    const t = r.reviewGroup.reviewTemplate;
    return [
        `# ${t.name} — ${r.reviewee.user.name}`,
        `[Open in Lattice](${url.href})`,
        r.reviewee.reviewCycle.name,
        t.instructions && richText(t.instructions),
        "Keep every question heading. Write below its instructions. Blank answers keep existing drafts. For choices, use one “Selected: label” line per choice; for a rating, use “Rating: label”.",
    ]
        .filter(Boolean)
        .join("\n\n");
}
function help(q, limit) {
    const { question, choices, scale } = q.revision;
    return guide([
        question.isOptional ? "Optional." : "Required for submission.",
        q.isPrivate ? "Hidden from the reviewee." : "",
        q.description && richText(q.description),
        choices?.length ? "Choices: " + choices.join(" · ") : "",
        scale?.length ? "Ratings: " + scale.join(" · ") : "",
        question.maximumSelection ? "Maximum selections: " + question.maximumSelection + "." : "",
        question.isBodyOptional !== undefined
            ? "Comment: " + (question.isBodyOptional ? "optional." : "required for submission.")
            : "",
        limit && /Body/.test(q.revision.__typename) ? "Word limit: " + limit + "." : "",
    ]
        .filter(Boolean)
        .join("\n"));
}
function nativeBody(md) {
    let fence = "";
    return md
        .split("\n")
        .map((l, i, a) => {
        const m = /^ {0,3}(`{3,}|~{3,})/.exec(l)?.[1];
        const inside = !!fence;
        if (m && (!fence || (m[0] === fence[0] && m.length >= fence.length)))
            fence = fence ? "" : m;
        if (!l.trim() && !inside && i > 0 && a[i - 1].trim())
            return "\n<br>\n";
        let text = l
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        if (!inside)
            text = text.replace(/^(\s*)&gt;(?=\s)/, "$1>");
        return text;
    })
        .join("\n");
}
function slots(q) {
    const t = q.revision.__typename;
    const pick = q.revision.scale
        ? "<rating: pick one>"
        : q.revision.choices
            ? t.startsWith("MultipleSelect")
                ? "<choices: pick one or more>"
                : "<choice: pick one>"
            : "";
    const text = t.includes("Body") ? (pick ? "<comment: write here>" : "<answer: write here>") : "";
    return { pick, text };
}
function withoutPlaceholders(answer, q) {
    const { pick, text } = slots(q);
    let skippedPick = false, skippedText = false;
    const lines = answer.split("\n").flatMap((line) => {
        const value = line.trim();
        if (pick && value === pick) {
            skippedPick = true;
            return [];
        }
        if (text && value === text) {
            skippedText = true;
            return [];
        }
        const selected = pick === "<choice: pick one>" && /^<choice:\s*([^<>]+)>$/i.exec(value);
        if (selected) {
            const label = norm(selected[1]).normalize("NFC").toLowerCase();
            const matches = q.revision.choices.filter((v) => norm(v).normalize("NFC").toLowerCase() === label);
            if (matches.length !== 1)
                throw Error("Invalid choice for: " + heading(q));
            return ["Selected: " + matches[0]];
        }
        if (/<(?:answer|choice|choices|rating|comment):/i.test(decodeHTML(line)))
            throw Error("Replace the whole placeholder in: " + heading(q));
        return [line];
    });
    let cleaned = lines.join("\n").trim();
    if (skippedPick && text && !skippedText && cleaned && !/^(?:Selected|Rating|Comment):/i.test(cleaned))
        cleaned = "Comment: " + cleaned;
    return cleaned;
}
function draftDocument(r, url, markdown) {
    const titles = r.questions.map(heading);
    if (new Set(titles).size !== titles.length)
        throw Error("Duplicate question names in this form; cannot match sections safely.");
    const preamble = intro(r, url), limit = r.reviewGroup.reviewTemplate.wordCountLimit;
    const guides = r.questions.map((q) => help(q, limit));
    const replies = titles.map((_, i) => {
        const q = r.questions[i], c = q.reviewResponse?.content;
        const selected = (c?.multipleSelect ?? [])
            .map((n) => "Selected: " + choice(q.revision.choices, Number(n)))
            .join("\n");
        const rating = c?.rating != null && String(c.rating) !== ""
            ? "Rating: " + choice(q.revision.scale, Number(c.rating) - 1)
            : "";
        const body = c?.body && richText(c.body);
        const { pick, text } = slots(q);
        const field = selected || rating, prose = body && !field && pick ? "Comment: " + body : body;
        return {
            current: [field, prose].filter(Boolean).join("\n\n"),
            display: [field || pick, prose || text].filter(Boolean).join("\n\n"),
        };
    });
    const template = [
        preamble,
        ...titles.map((h, i) => ["## " + h, guides[i], replies[i].display].filter(Boolean).join("\n\n")),
    ].join("\n\n") + "\n";
    const local = {};
    const updates = [];
    if (markdown === undefined)
        return { template, updates, local };
    let src = markdown
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trim();
    if (src.startsWith("# ")) {
        if (!src.startsWith(preamble + "\n"))
            throw Error("Template header does not match this review. Get a fresh template.");
        src = src.slice(preamble.length).trim();
    }
    const sections = new Map();
    let current;
    let fence = "";
    for (const line of src.split("\n")) {
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (!fence && /^##(?:\s|$)/.test(line)) {
            const h = norm(line.slice(2));
            if (!titles.includes(h))
                throw Error("Unknown question: " + h);
            if (sections.has(h))
                throw Error("Repeated question: " + h);
            current = [];
            sections.set(h, current);
            continue;
        }
        if (!current)
            throw Error("Expected a ## question heading.");
        current.push(line);
        if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length)))
            fence = fence ? "" : marker;
    }
    if (fence)
        throw Error("Unclosed code fence.");
    for (const [i, q] of r.questions.entries()) {
        const h = titles[i], lines = sections.get(h);
        if (!lines)
            throw Error("Missing question: " + h);
        let answer = lines.join("\n").trim();
        if (answer === guides[i] || answer.startsWith(guides[i] + "\n"))
            answer = answer.slice(guides[i].length).trim();
        else if (answer.startsWith("> Required for submission.") || answer.startsWith("> Optional."))
            throw Error("Template guidance changed for: " + h);
        answer = withoutPlaceholders(answer, q);
        local[q.id] = hash(answer);
        if (!answer || answer === replies[i].current)
            continue;
        const t = q.revision.__typename, hasBody = /^(?:Body|(?:Rating|MultipleChoice|MultipleSelect)AndBody)QuestionRevision$/.test(t);
        const old = q.reviewResponse?.content;
        const content = {};
        if (old?.body)
            content.body = old.body;
        if (old?.rating)
            content.rating = String(old.rating);
        if (old?.multipleSelect?.length)
            content.multipleSelect = old.multipleSelect.map(String);
        const { choices, scale, question } = q.revision;
        if (choices || scale) {
            const labels = choices ?? scale, prefix = choices ? "Selected: " : "Rating: ";
            const rows = answer.split("\n");
            const canon = (v) => norm(v).normalize("NFC").toLowerCase();
            const normalized = labels.map(canon);
            const binary = t.startsWith("MultipleChoice") &&
                labels.length === 2 &&
                (["yes", "no"].every((x) => normalized.includes(x)) ||
                    ["true", "false"].every((x) => normalized.includes(x)));
            const indexOf = (v) => {
                let key = canon(v);
                if (binary && ["yes", "true", "no", "false"].includes(key))
                    key =
                        key === "yes" || key === "true"
                            ? normalized.includes("yes")
                                ? "yes"
                                : "true"
                            : normalized.includes("no")
                                ? "no"
                                : "false";
                const n = normalized.indexOf(key);
                return n >= 0 && normalized.lastIndexOf(key) === n ? n : -1;
            };
            const picked = [], seen = new Set();
            while (rows.length) {
                const line = rows[0].trim();
                if (!line)
                    break;
                const explicit = line.match(/^(Selected|Rating):\s*(.*)$/i);
                const check = line.match(/^[-*] \[([ xX])\]\s+(.+)$/);
                const bullet = t.startsWith("MultipleSelect") && line.match(/^[-*]\s+(.+)$/);
                if (explicit && explicit[1].toLowerCase() + ": " !== prefix.toLowerCase())
                    throw Error("Invalid choice field for: " + h);
                const label = explicit?.[2] ?? check?.[2] ?? (bullet ? bullet[1] : line);
                const n = indexOf(label);
                if (n < 0 && !explicit && !check && !bullet)
                    break;
                if (n < 0)
                    throw Error("Invalid choice for " + h + ": " + label + ". Options: " + labels.join(" · "));
                if (seen.has(n))
                    throw Error("Repeated choice for: " + h);
                seen.add(n);
                if (!check || check[1] !== " ")
                    picked.push(n);
                rows.shift();
            }
            if ((!t.startsWith("MultipleSelect") && picked.length > 1) ||
                (question.maximumSelection && picked.length > question.maximumSelection))
                throw Error("Invalid number of choices for: " + h);
            if (picked.length) {
                if (choices)
                    content.multipleSelect = picked.map(String);
                else
                    content.rating = String(picked[0] + 1);
            }
            answer = rows.join("\n").trim();
            if (answer) {
                if (!hasBody ||
                    /^(?:Selected|Rating):/im.test(answer) ||
                    (!picked.length && !/^Comment:\s*/i.test(answer)))
                    throw Error("Invalid choice for " + h + ". Options: " + labels.join(" · "));
                answer = answer.replace(/^Comment:\s*/i, "");
            }
        }
        if (answer) {
            if (!hasBody)
                throw Error("Unsupported question type: " + t);
            if (limit && answer.split(/\s+/).length > limit)
                throw Error("Word limit exceeded for: " + h);
            content.body = nativeBody(answer);
        }
        if (content.body !== old?.body ||
            content.rating !== (old?.rating == null ? undefined : String(old.rating)) ||
            JSON.stringify(content.multipleSelect ?? []) !== JSON.stringify((old?.multipleSelect ?? []).map(String)))
            updates.push({ reviewRequestQuestionId: q.id, content });
    }
    return { template, updates, local };
}
function hash(text) {
    return createHash("sha256").update(text).digest("hex");
}
function choice(labels, n) {
    if (labels?.[n] === undefined)
        throw Error("Unknown Lattice choice index.");
    return labels[n];
}
async function loadReview(query, cycle, request) {
    const { viewer: { r }, } = await query(fields, { id: request });
    if (!r || r.entityId !== request || !r.viewerIsResponder || r.reviewee.reviewCycle.entityId !== cycle)
        throw Error("This is not your review assignment for that cycle.");
    if (r.submittedAt || r.lockedAt || r.closedAt || r.isRejected || !r.reviewee.reviewCycle.canReviewsBeWritten)
        throw Error("This review is not open for draft writing.");
    return r;
}
export async function latticeReviewDraft(runtime, input, markdown) {
    const { url, cycle, request } = target(input, true);
    return browser(runtime, url, async (query, args) => {
        const r = await loadReview(query, cycle, request);
        const { template, updates } = draftDocument(r, url, markdown);
        if (markdown === undefined)
            return template;
        if (!updates.length)
            return "No draft changes.";
        await save(runtime, url, args, request, updates);
        return `Saved ${updates.length} draft answer(s). Nothing was submitted.`;
    });
}
async function save(runtime, url, args, request, updates) {
    if (updates.some((u) => u.content.body && /<(?:answer|choice|choices|rating|comment):/i.test(decodeHTML(u.content.body))))
        throw Error("Unresolved placeholder in outgoing draft. Nothing was sent.");
    const mutation = "mutation SaveDraftReviewResponsesMutation($input:SaveDraftReviewResponsesInput!){saveDraftReviewResponses(input:$input){errors results{reviewRequestQuestion{id reviewResponse{content}} reviewRequest{entityId submittedAt}}}}";
    const data = {
        id: "SaveDraftReviewResponsesMutation",
        query: mutation,
        variables: { input: { reviewRequestQuestions: updates } },
    };
    const dir = await mkdtemp(resolve(".wire-lattice-"));
    try {
        const file = join(dir, "draft.js");
        await writeFile(file, `async page=>{const r=await page.request.post(${JSON.stringify(url.origin + "/graphql")},{maxRedirects:0,data:${JSON.stringify(data)}});return await r.json()}`, { mode: 0o600 });
        const result = JSON.parse((await runtime.process.execute("playwright-cli", [...args, "run-code", "--filename=" + file])).stdout);
        const saved = result.data?.saveDraftReviewResponses;
        if (result.errors?.length ||
            !saved ||
            saved.errors?.length ||
            saved.results?.length !== updates.length ||
            !updates.every((u) => saved.results.some((v) => {
                const c = v.reviewRequestQuestion.reviewResponse?.content;
                return (v.reviewRequest.entityId === request &&
                    v.reviewRequest.submittedAt === null &&
                    v.reviewRequestQuestion.id === u.reviewRequestQuestionId &&
                    !!c &&
                    (!u.content.body || c.body === u.content.body) &&
                    (!u.content.rating || String(c.rating) === u.content.rating) &&
                    (!u.content.multipleSelect ||
                        JSON.stringify(c.multipleSelect?.map(String)) === JSON.stringify(u.content.multipleSelect)));
            })))
            throw Error("Lattice did not confirm every draft answer. Check the review before retrying.");
    }
    finally {
        await rm(dir, { recursive: true });
    }
}
async function openRequests(query, cycle) {
    const rows = new Map();
    const load = (cursor) => query(`($cycle:String!,$after:String){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){canReviewsBeWritten groups:viewerReviewGroupsToRespond{id requests:viewerReviewRequests(first:50,after:$after){pageInfo{hasNextPage endCursor} edges{node{entityId status viewerIsResponder submittedAt closedAt lockedAt isRejected reviewee{user{name}} reviewGroup{type}}}}}}}}`, { cycle, after: cursor });
    const first = (await load(null)).viewer.cycle;
    if (!first.canReviewsBeWritten)
        return [];
    for (const g of first.groups) {
        let page = g.requests;
        const cursors = new Set();
        for (;;) {
            for (const { node: r } of page.edges)
                if (r.viewerIsResponder && !r.submittedAt && !r.closedAt && !r.lockedAt && !r.isRejected)
                    rows.set(r.entityId, r);
            if (!page.pageInfo.hasNextPage)
                break;
            const after = page.pageInfo.endCursor;
            if (!after || cursors.has(after))
                throw Error("Lattice pagination did not advance.");
            cursors.add(after);
            page = (await load(after)).viewer.cycle.groups.find((x) => x.id === g.id).requests;
        }
    }
    return [...rows.values()];
}
export async function listLatticeReviewRequests(runtime, input) {
    const { url, cycle } = target(input, false);
    return browser(runtime, url, async (query) => {
        return ((await openRequests(query, cycle))
            .map((r) => `- [${r.reviewee.user.name.replace(/[\\[\]]/g, "\\$&")}](${url.origin}/reviews/${cycle}/participant/response/${r.entityId}) · ${r.reviewGroup.type} · ${r.status}`)
            .join("\n") || "No open review requests.");
    });
}
function remoteHash(c) {
    return hash(JSON.stringify([c?.body ?? "", String(c?.rating ?? ""), (c?.multipleSelect ?? []).map(String)]));
}
export async function syncLatticeDrafts(runtime, input, directory, file) {
    const selected = file === undefined ? undefined : resolve(directory, file);
    if (selected)
        directory = dirname(selected);
    const stateName = ".wire-lattice-drafts.json", folderPattern = /^lattice-drafts(?:-\d{4}(?:-.+)?)?$/;
    const cwdEntries = await readdir(directory, { withFileTypes: true });
    if (selected && !cwdEntries.some((e) => e.name === stateName && e.isFile()))
        throw Error("Choose a Markdown file from a saved drafts folder.");
    if (!folderPattern.test(basename(directory)) && !cwdEntries.some((e) => e.name === stateName)) {
        if (input) {
            const { url, cycle } = target(input, false);
            const info = await browser(runtime, url, async (query) => (await query("($cycle:String!){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){name createdAt}}}", { cycle })).viewer.cycle);
            const years = info.name.match(/\b(?:19|20)\d{2}\b/g);
            const year = years?.length === 1 ? years[0] : info.createdAt.slice(0, 4);
            if (!/^\d{4}$/.test(year))
                throw Error("Missing year for this Lattice cycle.");
            directory = join(directory, "lattice-drafts-" + year);
            await mkdir(directory, { recursive: true, mode: 0o700 });
        }
        else {
            const folders = cwdEntries.filter((e) => e.isDirectory() && folderPattern.test(e.name));
            if (folders.length !== 1)
                throw Error("Run wire lattice sync in a saved drafts folder, or provide the cycle requests URL.");
            directory = join(directory, folders[0].name);
        }
    }
    const stateFile = join(directory, stateName);
    const lock = join(directory, ".wire-lattice-sync.lock");
    await mkdir(lock, { mode: 0o700 });
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        const stored = entries.some((e) => e.name === stateName)
            ? JSON.parse(await readFile(stateFile, "utf8"))
            : null;
        const state = stored?.reviews ?? stored ?? {};
        const known = [...new Set(Object.keys(state).map((s) => s.replace(/\/response\/[^/]+$/, "/requests")))];
        const source = stored?.source ?? (known.length === 1 ? known[0] : undefined);
        if (!input && !source)
            throw Error("Provide the Lattice cycle requests URL for this folder's first sync.");
        const { url, cycle } = target(input ?? source, false);
        if (source && source !== url.href)
            throw Error("This drafts folder is already linked to another Lattice cycle: " + source);
        let persisted = stored?.source === url.href;
        const saveState = async () => {
            const tmp = join(lock, "state.json");
            await writeFile(tmp, JSON.stringify({ source: url.href, reviews: state }) + "\n", { mode: 0o600 });
            await rename(tmp, stateFile);
            persisted = true;
        };
        const docs = new Map();
        const names = new Set(entries.map((e) => e.name.toLowerCase()));
        for (const e of entries) {
            if ((selected && e.name !== basename(selected)) || !e.isFile() || !e.name.endsWith(".md"))
                continue;
            const md = await readFile(join(directory, e.name), "utf8");
            const source = /^\[Open in Lattice\]\((https:\/\/[^)]+)\)$/m.exec(md)?.[1];
            if (!source)
                continue;
            if (docs.has(source))
                throw Error("Multiple draft files for " + source);
            docs.set(source, { name: e.name, md });
        }
        const address = [...docs.keys()][0];
        if (selected && (!address || state[address]?.file !== basename(selected)))
            throw Error("The selected file does not match a tracked Lattice draft.");
        const single = selected ? target(address, true) : undefined;
        if (single && (single.url.origin !== url.origin || single.cycle !== cycle))
            throw Error("The selected file belongs to another Lattice cycle.");
        return await browser(runtime, url, async (query, args) => {
            const jobs = [];
            let refreshed = 0, created = 0, answers = 0;
            for (const row of single ? [{ entityId: single.request }] : await openRequests(query, cycle)) {
                const address = new URL("response/" + row.entityId, url);
                const key = address.href, prev = state[key], doc = docs.get(key);
                if (prev && !doc)
                    throw Error("Cannot find the draft for " + key + " (previously " + prev.file + ").");
                const r = await loadReview(query, cycle, row.entityId);
                const template = draftDocument(r, address).template;
                let name = doc?.name;
                if (!name) {
                    const stem = [r.reviewee.reviewCycle.name, r.reviewGroup.type, r.reviewee.user.name]
                        .join(" - ")
                        .normalize("NFC")
                        .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
                        .replace(/^-|-$/g, "")
                        .slice(0, 160);
                    name = stem + ".md";
                    for (let n = 2; names.has(name.toLowerCase()); n++)
                        name = stem + "-" + n + ".md";
                    names.add(name.toLowerCase());
                }
                const parsed = draftDocument(r, address, doc?.md ?? template);
                const updates = parsed.updates.filter((u) => {
                    const old = prev?.questions[u.reviewRequestQuestionId];
                    if (!doc || old?.local === parsed.local[u.reviewRequestQuestionId])
                        return false;
                    const q = r.questions.find((q) => q.id === u.reviewRequestQuestionId);
                    const current = remoteHash(q.reviewResponse?.content);
                    if (old ? old.remote !== current : current !== remoteHash(undefined))
                        throw Error("Draft conflict: " +
                            name +
                            " / " +
                            heading(q) +
                            ". Compare with Lattice before filling this review.");
                    return true;
                });
                const questions = Object.fromEntries(r.questions.map((q) => {
                    const local = parsed.local[q.id], old = prev?.questions[q.id], saved = updates.find((u) => u.reviewRequestQuestionId === q.id);
                    return [
                        q.id,
                        {
                            local,
                            remote: old && old.local === local
                                ? old.remote
                                : remoteHash(saved?.content ?? q.reviewResponse?.content),
                        },
                    ];
                }));
                const markers = r.questions.flatMap((q) => Object.values(slots(q))).filter(Boolean);
                const unmarked = (md) => md
                    .split("\n\n")
                    .filter((block) => !markers.includes(block.trim()))
                    .join("\n\n")
                    .trimEnd();
                const refresh = doc && doc.md.trimEnd() !== template.trimEnd() && unmarked(doc.md) === unmarked(template);
                jobs.push({
                    key,
                    name,
                    template,
                    create: !doc,
                    before: doc?.md,
                    refresh,
                    updates,
                    questions,
                    address,
                    request: row.entityId,
                });
            }
            for (const job of jobs) {
                if ((job.refresh || job.updates.length) &&
                    job.before !== undefined &&
                    (await readFile(join(directory, job.name), "utf8")) !== job.before)
                    throw Error("Draft file changed during sync: " + job.name);
                if (job.refresh) {
                    const tmp = join(lock, "template.md");
                    await writeFile(tmp, job.template, { mode: 0o600 });
                    await rename(tmp, join(directory, job.name));
                    refreshed++;
                }
                if (job.create) {
                    await writeFile(join(directory, job.name), job.template, { flag: "wx", mode: 0o600 });
                    created++;
                }
                if (job.updates.length) {
                    await save(runtime, job.address, args, job.request, job.updates);
                    answers += job.updates.length;
                }
                const next = { file: job.name, questions: job.questions };
                if (JSON.stringify(state[job.key]) === JSON.stringify(next))
                    continue;
                state[job.key] = next;
                await saveState();
            }
            if (!persisted)
                await saveState();
            return `${basename(directory)}: ${jobs.length} open reviews; ${created} placeholder(s) created; ${refreshed} template(s) refreshed; ${answers} draft answer(s) saved. Nothing was submitted.`;
        });
    }
    finally {
        await rm(lock, { recursive: true });
    }
}
//# sourceMappingURL=draft.js.map