import { createHash } from "node:crypto";
const origin = "https://app.ashbyhq.com";
const entries = "id sourceFormDefinitionId fieldEntries { field fieldValue { ... on JSONBox { value } } isHidden isFixed }";
function plain(n) {
    const body = n.text ?? (n.content ?? []).map(plain).join("");
    if (n.type === "text") {
        const url = n.marks?.find((m) => m.type === "link")?.attrs?.href;
        return url ? `[${body}](${url})` : body;
    }
    if (n.type === "listItem")
        return "- " + body.trimEnd() + "\n";
    return (body + (["paragraph", "heading", "hardBreak"].includes(n.type) ? "\n" : ""));
}
export async function ashbySession(runtime, cookies) {
    const cookie = cookies
        .filter((c) => ["ashbyhq.com", "app.ashbyhq.com"].includes(c.domain.replace(/^\./, "")))
        .map((c) => c.name + "=" + c.value)
        .join("; ");
    const res = await runtime.http.request(origin + "/api/csrf/token", {
        headers: { cookie },
        redirect: "error",
    });
    if (!res.ok)
        throw new Error("Ashby authentication failed. Run `wire ashby login`.");
    const { token } = await res.json();
    const csrfCookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    return async (query, variables = {}) => {
        const response = await runtime.http.request(origin + "/api/graphql", {
            method: "POST",
            redirect: "error",
            headers: {
                cookie: [cookie, csrfCookie].filter(Boolean).join("; "),
                "x-csrf-token": token,
                "x-ashby-app": "Recruiting",
                "content-type": "application/json",
                origin,
            },
            body: JSON.stringify({ query, variables }),
        });
        if (!response.ok)
            throw new Error("Ashby request failed (HTTP " + response.status + ").");
        const result = await response.json();
        if (result.errors?.length || !result.data)
            throw new Error("Ashby rejected the request. Check your login and access to the interview.");
        return result.data;
    };
}
function eventId(url) {
    const m = /^https:\/\/app\.ashbyhq\.com\/interview-briefings\/([\da-f-]{36})(?:\/feedback)?\/?$/.exec(url);
    if (!m)
        throw new Error("Expected an Ashby interview briefing URL.");
    return m[1];
}
function answer(e) {
    const v = e.fieldValue?.value;
    if (v == null)
        return "";
    if (e.field.type === "RichText")
        return plain(v.content).trim();
    const label = (s) => e.field.selectableValues?.find((o) => o.value === s)?.label ?? String(s);
    return (Array.isArray(v) ? v.map(label).join("\n") : label(v)).trim();
}
const hash = (s) => createHash("sha256").update(s).digest("hex");
function template(url, name, form, owner) {
    return ([
        `# ${name}\n\n${url}\n<!-- ashby-draft ${owner} -->`,
        ...form.fieldEntries
            .filter((e) => !e.isHidden && !e.isFixed)
            .map((e) => {
            const value = answer(e);
            const options = e.field.selectableValues?.map((o) => o.label) ??
                (e.field.type === "Boolean" ? ["true", "false"] : []);
            return (`## ${e.field.title}\n<!-- ashby-field ${encodeURIComponent(e.field.path)} ${hash(value)} -->\n` +
                (options.length ? "> Options: " + options.join(" | ") + "\n" : "") +
                "\n" +
                value);
        }),
    ].join("\n\n") + "\n");
}
function payload(e, value) {
    if (e.field.type === "RichText")
        return {
            version: "2",
            attachments: [],
            features: [],
            content: {
                type: "doc",
                content: value
                    .split("\n")
                    .map((text) => ({
                    type: "paragraph",
                    content: text ? [{ type: "text", text }] : [],
                })),
            },
        };
    if (e.field.type === "Boolean" && ["true", "false"].includes(value))
        return value === "true";
    if (e.field.type === "String" || e.field.type === "LongText")
        return value;
    if (["MultiValueSelect", "ValueSelect"].includes(e.field.type)) {
        const selected = value.split("\n").map((s) => {
            const options = e.field.selectableValues?.filter((o) => o.label === s);
            if (options?.length !== 1)
                throw new Error("Invalid option for " + e.field.title);
            return options[0].value;
        });
        if (e.field.type === "MultiValueSelect")
            return selected;
        if (selected.length === 1)
            return selected[0];
    }
    throw new Error("Unsupported answer for " + e.field.title);
}
const header = "candidate { name } jobTitle interviewEvent { id startTime endTime interview { title } }";
async function draft(q, url) {
    const b = (await q(`query($id:String!) { interviewBriefing(interviewEventId:$id) { ${header} interviewerEvent { id scorecardSubmission { ... on Scorecard { id } } } } }`, { id: eventId(url) })).interviewBriefing;
    if (!b.interviewerEvent || b.interviewerEvent.scorecardSubmission !== null)
        throw new Error("No editable personal scorecard for this interview.");
    const form = (await q(`mutation($id:String!){ startScorecardForm(interviewerEventId:$id){ ${entries} } }`, { id: b.interviewerEvent.id })).startScorecardForm;
    return { form, owner: b.interviewerEvent.id, name: b.candidate.name };
}
export async function ashby(runtime, action, arg) {
    const q = await ashbySession(runtime, await runtime.cookies.load("ashby"));
    if (action === "interviews" || action === "pending") {
        const fields = "id startTime endTime interview{title} application{candidate{name} job{title}} interviewerEvents{interviewer{id}}";
        const { interviewEvents, sessionUser } = action === "pending"
            ? await q(`query {sessionUser{id} interviewEvents:interviewEventsWithOverdueScorecards{${fields}}}`)
            : await q(`query($now:DateTime!){ sessionUser{id} interviewEvents(onOrAfterTime:$now,ascending:true){${fields}} }`, { now: runtime.clock.now().toISOString() });
        return (interviewEvents
            .filter((e) => e.interviewerEvents.some((i) => i.interviewer.id === sessionUser.id))
            .map((e) => `- ${e.startTime} – ${e.endTime} · ${e.application.candidate.name} · ${e.interview.title} · ${e.application.job.title}\n  ${origin}/interview-briefings/${e.id}`)
            .join("\n") || "No matching interviews.");
    }
    if (action === "latest") {
        let cursor = null, latest;
        do {
            const d = await q(`query($cursor:String){sessionUser{id} paginatedInterviewEvents(cursor:$cursor){ results{id interviewerEvents{interviewer{id} scorecardSubmission{... on Scorecard{submittedAt submittedByUser{id}}}}} moreDataAvailable nextCursor}}`, { cursor });
            for (const event of d.paginatedInterviewEvents.results)
                for (const i of event.interviewerEvents) {
                    const s = i.scorecardSubmission;
                    if (s?.submittedAt &&
                        i.interviewer.id === d.sessionUser.id &&
                        s.submittedByUser?.id === d.sessionUser.id &&
                        (!latest || s.submittedAt > latest.at))
                        latest = { id: event.id, at: s.submittedAt };
                }
            cursor = d.paginatedInterviewEvents.moreDataAvailable
                ? d.paginatedInterviewEvents.nextCursor
                : null;
        } while (cursor);
        if (!latest)
            return "No submitted feedback.";
        const b = (await q(`query($id:String!){interviewBriefing(interviewEventId:$id){${header} interviewerEvent{scorecardSubmission{... on Scorecard{submittedAt submittedFormRender{${entries}}}}}}}`, { id: latest.id })).interviewBriefing;
        const s = b.interviewerEvent.scorecardSubmission;
        return [
            `# ${b.candidate.name} · ${b.interviewEvent.interview.title}\n\nSubmitted: ${s.submittedAt}\n${origin}/interview-briefings/${latest.id}/feedback`,
            ...s.submittedFormRender.fieldEntries
                .filter((e) => !e.isHidden && answer(e))
                .map((e) => "## " + e.field.title + "\n\n" + answer(e)),
        ].join("\n\n");
    }
    if (action === "prep") {
        const b = (await q(`query($id:String!) { interviewBriefing(interviewEventId:$id){${header} instructions applicationResume{employmentHistory{position employer{name}} educationHistory{school{name}}}}}`, { id: eventId(arg) })).interviewBriefing;
        const r = b.applicationResume;
        return [
            `# ${b.candidate.name} · ${b.interviewEvent.interview.title}`,
            b.jobTitle,
            b.interviewEvent.startTime + " – " + b.interviewEvent.endTime,
            arg,
            "## Candidate background",
            ...(r?.employmentHistory ?? []).map((x) => [x.position, x.employer?.name].filter(Boolean).join(", ")),
            ...(r?.educationHistory ?? []).map((x) => x.school?.name),
            "## Interview briefing",
            b.instructions && plain(b.instructions.content),
        ]
            .filter(Boolean)
            .join("\n\n");
    }
    if (action === "template") {
        const { name, form, owner } = await draft(q, arg);
        return template(arg, name, form, owner);
    }
    if (action !== "sync")
        throw new Error("Unknown Ashby command.");
    const file = arg, md = await runtime.filesystem.readText(file);
    const url = md.split("\n")[2];
    const { name, form, owner } = await draft(q, url);
    if (md.split("\n")[3] !== `<!-- ashby-draft ${owner} -->`)
        throw new Error("The file does not belong to this draft.");
    const sections = md.trimEnd().split(/^## /m).slice(1);
    const seen = new Set(), changes = [];
    for (const section of sections) {
        const m = /^[^\n]+\n<!-- ashby-field (\S+) ([a-f0-9]{64}) -->\n?(?:> Options:[^\n]*\n?)?([\s\S]*)$/.exec(section);
        if (!m)
            throw new Error("Invalid Ashby section; keep the generated field markers.");
        const path = decodeURIComponent(m[1]), value = m[3].trim();
        const e = form.fieldEntries.find((e) => e.field.path === path && !e.isHidden && !e.isFixed);
        if (!e || seen.has(path))
            throw new Error("Unknown or repeated scorecard field.");
        seen.add(path);
        if (!value || hash(value) === m[2] || value === answer(e))
            continue;
        if (hash(answer(e)) !== m[2])
            throw new Error("Remote draft changed: " + e.field.title);
        changes.push({ path, value: payload(e, value), text: value });
    }
    if (!sections.length)
        throw new Error("No scorecard sections found.");
    for (const change of changes) {
        const updated = (await q(`mutation($id:String!,$path:String!,$v:JSON,$definition:String){setFormValue(formRenderIdentifier:$id,path:$path,value:$v,formDefinitionIdentifier:$definition){${entries}}}`, {
            id: form.id,
            path: change.path,
            v: change.value,
            definition: form.sourceFormDefinitionId,
        })).setFormValue;
        if (answer(updated.fieldEntries.find((e) => e.field.path === change.path)) !== change.text)
            throw new Error("Ashby did not save the requested value.");
    }
    const fresh = await draft(q, url);
    if (md !== (await runtime.filesystem.readText(file)))
        throw new Error("The local file changed during sync.");
    await runtime.filesystem.writeText(file, template(url, name, fresh.form, owner));
    return `Saved ${changes.length} draft section(s). Review and submit: ${url}`;
}
//# sourceMappingURL=ashby.js.map