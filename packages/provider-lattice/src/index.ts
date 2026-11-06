import { defineService, type AddMarkdown, type FetchedDocument, type RuntimeCapabilities } from "wire-core";
import { richText } from "./markdown.js";

type Page<T> = { edges: { node: T }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Person = { name: string };
type Cycle = { entityId: string; name: string; createdAt: string };
type Feedback = {
  entityId: string;
  createdAt: string;
  body: string;
  author: Person;
  targets: Person[];
  visibility: string;
  feedbackRequest: { body: string; author: Person | null } | null;
  companyValues: { name: string }[];
};
type Assignment = {
  submittedAt: string | null;
  entityId: string;
  status: string;
  reviewee: Report & { viewerCanViewManagerPDFReviewPacket: boolean };
  reviewGroup: { type: string };
};
type Report = { entityId: string; user: Person };
type Group = { id: string; requests: Page<Assignment> };
type Question = {
  reviewRequest?: { submittedAt: string | null } | null;
  entityId: string;
  isPrivate: boolean;
  question: { body: string; scale?: string[]; choices?: string[] };
  calibrated?: number | string | null;
  response: {
    content:
      string | { body?: string; rating?: number | string | null; multipleSelect?: number[]; complete?: boolean };
  } | null;
};
type PacketGroup = {
  isRejected: boolean;
  reviewerRole: string;
  reviewer: { user: Person } | null;
  questions: Question[];
};
const paging = "pageInfo { hasNextPage endCursor }";
const feedbackFields =
  "entityId createdAt body visibility author { name } targets { name } feedbackRequest { body author { name } } companyValues { name }";
const requestFields =
  "entityId submittedAt status reviewGroup { type } reviewee { entityId viewerCanViewManagerPDFReviewPacket user { name } }";
const questions = `isPrivate question: questionRevisionV2 { body ... on RatingQuestionRevisionInterface { scale } ... on MultipleChoiceQuestionRevision { choices } ... on MultipleChoiceAndBodyQuestionRevision { choices } ... on MultipleSelectQuestionRevision { choices } ... on MultipleSelectAndBodyQuestionRevision { choices } }`;

async function pages<T>(first: Page<T>, next: (after: string) => Promise<Page<T>>): Promise<T[]> {
  const nodes: T[] = [];
  const cursors = new Set<string>();
  let page = first;
  for (;;) {
    nodes.push(...page.edges.map((edge) => edge.node));
    if (!page.pageInfo.hasNextPage) return nodes;
    const cursor = page.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("Lattice pagination did not advance.");
    cursors.add(cursor);
    page = await next(cursor);
  }
}

function label(values: string[] | undefined, index: number): string {
  if (values?.[index] === undefined) throw new Error("Lattice returned an answer without a matching choice.");
  return richText(values[index]);
}

function answers(items: Question[]): string {
  return items
    .map((q) => {
      const lines = [`#### ${richText(q.question.body)}`, ...(q.isPrivate ? ["*Private question*"] : [])];
      const c = q.response?.content;
      const body: string[] = [];
      if (typeof c === "string") body.push(richText(c));
      else if (c) {
        if (c.body) body.push(richText(c.body));
        if (c.rating != null && c.rating !== "")
          body.push("Rating: " + label(q.question.scale, Number(c.rating) - 1));
        if (q.calibrated != null && Number(q.calibrated) !== Number(c.rating))
          body.push("Calibrated rating: " + label(q.question.scale, Number(q.calibrated) - 1));
        if (c.multipleSelect?.length)
          body.push("Selected: " + c.multipleSelect.map((i) => label(q.question.choices, Number(i))).join(", "));
        for (const key of Object.keys(c))
          if (!["body", "rating", "multipleSelect", "complete"].includes(key))
            throw new Error("Unsupported Lattice answer field: " + key);
      }
      return body.some(Boolean)
        ? [...lines, body.filter(Boolean).join("\n\n")].join("\n\n")
        : lines.join(" · ") + " — *No response*";
    })
    .join("\n\n");
}

const id = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const paths = new RegExp(
  `^(?:/|/users/reviews|/users/${id}/(?:reviews|feedback)|/feedback/${id}|/reviews/${id}/(?:participant/(?:requests|reviewee-packet)|participant/response/${id}(?:/completed)?|manager/direct-reports/${id}))$`,
  "i",
);
const tenant = /^[a-z0-9-]+\.latticehq\.com$/;
function segment(value: string) {
  const name = value
    .normalize("NFC")
    .replace(/[\x00-\x1f/\\:*?"<>|]/g, "–")
    .trim()
    .replace(/^[.]+|[. ]+$/g, "");
  if (!name) throw new Error("Missing Lattice name for archive path.");
  return Array.from(name).slice(0, 95).join("");
}
function dated(date: string, title: string) {
  return (
    date.slice(0, 10) +
    "-" +
    segment(title)
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") +
    ".md"
  );
}
const link = (text: string, href: string) => {
  const target = href.startsWith("https://")
    ? href
    : href
        .split("/")
        .map((part) => encodeURIComponent(part).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29")))
        .join("/");
  return `[${text.replace(/[\\[\]]/g, "\\$&")}](${target})`;
};
const doc = (title: string, url: string, parts: string[]): FetchedDocument => ({
  title,
  markdown:
    [`# ${title}`, link("Open in Lattice", url), ...parts]
      .filter(Boolean)
      .map(
        (part, i, all) =>
          (i === 0 ? "" : part.startsWith("- ") && all[i - 1]!.startsWith("- ") ? "\n" : "\n\n") + part,
      )
      .join("")
      .trimEnd() + "\n",
  data: { url },
});

async function read(runtime: RuntimeCapabilities, url: URL, add?: AddMarkdown) {
  const session = "-s=lattice-" + crypto.randomUUID();
  const args = [session, "--raw"];
  await runtime.process.execute("hey-browser", [
    "run",
    "--",
    "playwright-cli",
    ...args,
    "attach",
    "--extension=chrome",
  ]);
  const query = async <T>(fields: string, vars: Record<string, string | null> = {}): Promise<T> => {
    const data = { id: "WireLatticeRead", query: "query WireLatticeRead " + fields, variables: vars };
    const code = `async page=>{const r=await page.request.post(${JSON.stringify(url.origin + "/graphql")},{maxRedirects:0,data:${JSON.stringify(data)}});return r.headers()["content-type"]?.includes("json") ? await r.json() : {errors:[{message:"Lattice HTTP "+r.status()+": sign in to this workspace in Chrome."}]}}`;
    const result = JSON.parse(
      (await runtime.process.execute("playwright-cli", [...args, "run-code", code])).stdout,
      (key, value) =>
        key === "name" && typeof value === "string" ? value.replace(/\s*\(deactivated\)\s*$/i, "") : value,
    );
    if (result.errors?.length)
      throw new Error(result.errors.map((e: { message: string }) => e.message).join("; "));
    return result.data as T;
  };
  try {
    const viewer = (
      await query<{ viewer: { user: Person & { entityId: string } } }>("{ viewer { user { name entityId } } }")
    ).viewer.user;
    const path = url.pathname.replace(/\/$/, "");
    const [, area, key, section, action, item] = path.split("/");
    if (area === "users" && section && key !== viewer.entityId)
      throw new Error("Use your own Lattice profile URL.");
    const origin = url.origin;
    const base = "lattice";
    const mine = segment(viewer.name);
    const save = async (relative: string, markdown: string) =>
      (await add!(base + "/" + relative, markdown)).slice(base.length + 1);
    const finish = async (file: string, document: FetchedDocument) => ({
      ...document,
      path: base + "/" + (add ? await save(file, document.markdown) : file),
    });
    const feedbackPage = async (after: string | null, direction: string) => {
      const fields = `{ ${paging} edges{node{__typename ... on Feedback{${feedbackFields}}}} }`;
      if (direction === "TEAM")
        return (
          await query<{ viewer: { feed: Page<Feedback & { __typename: string }> } }>(
            `($after:String){viewer{feed:allDirectAndCustomRelationshipReportFeedback(first:50,after:$after,includePrivateNotes:false)${fields}}}`,
            { after },
          )
        ).viewer.feed;
      return (
        await query<{ viewer: { user: { feed: Page<Feedback & { __typename: string }> } } }>(
          `($after:String,$direction:FeedbackDirectionEnum!){viewer{user{feed:viewerVisibleFeedback(first:50,after:$after,feedbackDirection:$direction)${fields}}}}`,
          { after, direction },
        )
      ).viewer.user.feed;
    };
    const feedbackDoc = (f: Feedback) =>
      doc(
        `Feedback from ${f.author.name} to ${f.targets.map((t) => t.name).join(", ")}`,
        origin + "/feedback/" + f.entityId,
        [
          f.createdAt + " · " + f.visibility,
          ...(f.feedbackRequest
            ? [
                "Requested by: " + (f.feedbackRequest.author?.name ?? "Author not disclosed"),
                richText(f.feedbackRequest.body),
              ]
            : []),
          richText(f.body),
          ...(f.companyValues.length ? ["Values: " + f.companyValues.map((v) => v.name).join(", ")] : []),
        ],
      );
    const requestDoc = async (cycle: Cycle, req: string) => {
      const {
        viewer: { request },
      } = await query<{
        viewer: {
          request: Assignment & {
            reviewee: { reviewCycle: Cycle };
            submittedAt: string | null;
            questions: Question[];
          };
        };
      }>(
        `($req:String!){viewer{request:findReviewRequest(reviewRequestId:$req){${requestFields} submittedAt reviewee{reviewCycle{entityId name}} questions:reviewRequestQuestions{${questions} response:reviewResponse{content}}}}}`,
        { req },
      );
      if (request.reviewee.reviewCycle.entityId !== cycle.entityId)
        throw new Error("Review belongs to a different cycle.");
      const href =
        origin +
        "/reviews/" +
        cycle.entityId +
        "/participant/response/" +
        req +
        (request.status === "COMPLETE" ? "/completed" : "");
      return doc(viewer.name + " → " + request.reviewee.user.name, href, [
        request.reviewee.reviewCycle.name,
        request.reviewGroup.type +
          " · " +
          request.status +
          (request.submittedAt ? " · " + request.submittedAt : ""),
        answers(request.questions),
      ]);
    };
    const packetDoc = async (cycleId: string, report?: string) => {
      const role = report ? "Manager" : "Reviewee";
      const selector = report ? "findRevieweeByEntityId(entityId:$report)" : "viewerReviewee";
      const {
        viewer: { cycle },
      } = await query<{
        viewer: {
          cycle: Cycle & {
            hasCalibrationEnded: boolean;
            person: Report & { reviewSummary: { body: string } | null; reviewPacket: { groups: PacketGroup[] } };
          };
        };
      }>(
        `($cycle:String!${report ? ",$report:String!" : ""}){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){name createdAt hasCalibrationEnded person:${selector}{user{name} reviewSummary{body} reviewPacket{groups:responsesGroupedByReviewer(viewAs:${role}){isRejected reviewerRole reviewer{user{name}} questions:reviewRequestQuestions{entityId reviewRequest{submittedAt} ${questions} calibrated:calibratedReviewResponse(viewAs:${role}) response:reviewResponse{content(viewAs:${role})}}}}}}}}`,
        { cycle: cycleId, ...(report ? { report } : {}) },
      );
      const p = cycle.person;
      const packetUrl =
        origin +
        "/reviews/" +
        cycleId +
        (report ? "/manager/direct-reports/" + report : "/participant/reviewee-packet");
      const directory = report
        ? "Team/" + segment(cycle.name) + "/" + segment(p.user.name)
        : mine + "/" + segment(cycle.name) + "/My packet";
      const sections = p.reviewSummary?.body ? ["## Summary", richText(p.reviewSummary.body)] : [];
      const requested = url.hash.match(/^#review-([0-9a-f-]+)$/i)?.[1];
      for (const group of p.reviewPacket.groups) {
        const author = group.reviewer?.user?.name ?? "Author not disclosed";
        const role = group.reviewerRole.toLowerCase().replace(/_/g, " ");
        const heading = author + " · " + role;
        const body = answers(
          group.questions.map((q) => ({
            ...q,
            calibrated: cycle.hasCalibrationEnded && !q.isPrivate ? (q.calibrated ?? null) : null,
          })),
        );
        const questionId = group.questions[0]?.entityId;
        let title = heading;
        if (
          questionId &&
          group.questions.some((q) => {
            const c = q.response?.content;
            return typeof c === "string"
              ? c.trim()
              : c && (c.body?.trim() || (c.rating != null && c.rating !== "") || c.multipleSelect?.length);
          })
        ) {
          const address = packetUrl + "#review-" + questionId;
          const single = doc(author + " → " + p.user.name, address, [cycle.name, "Reviewer role: " + role, body]);
          const name = dated(
            group.questions[0]?.reviewRequest?.submittedAt ?? cycle.createdAt,
            author + " on " + p.user.name,
          );
          const singlePath = directory + "/" + segment(role) + "/" + name;
          if (requested === questionId) return finish(singlePath, single);
          if (!requested && add) {
            const file = await save(singlePath, single.markdown);
            title = link(heading, file.slice(directory.length + 1));
          }
        }
        sections.push("## " + title, (group.isRejected ? "*Request declined*\n\n" : "") + body);
      }
      if (requested) throw new Error("Contribution not found in this packet.");
      return finish(
        directory + "/" + dated(cycle.createdAt, "Review packet for " + p.user.name),
        doc(p.user.name + " — " + cycle.name, packetUrl, sections),
      );
    };
    if (action === "reviewee-packet") return packetDoc(key!);
    if (action === "direct-reports") return packetDoc(key!, item!);

    const parts: string[] = [];
    if (!area || area === "feedback" || section === "feedback") {
      const written = new Map<string, string>();
      for (const [direction, title] of (section === "feedback"
        ? [["GIVEN", "You’ve given"]]
        : [
            ["GIVEN", "You’ve given"],
            ["RECEIVED", "You’ve received"],
            ["TEAM", "Team feedback"],
          ]) as [string, string][]) {
        const feedback = await pages(await feedbackPage(null, direction), (after) =>
          feedbackPage(after, direction),
        );
        parts.push("## Feedback · " + title);
        for (const f of feedback) {
          if (f.__typename !== "Feedback") throw new Error("Unsupported Lattice feedback type: " + f.__typename);
          if (area === "feedback" && f.entityId !== key) continue;
          const d = feedbackDoc(f),
            file =
              (direction === "TEAM" ? "Team" : mine) +
              "/Feedback/" +
              (direction === "GIVEN" ? "Given" : direction === "RECEIVED" ? "Received" : "Team feedback") +
              "/" +
              segment(f.targets.map((t) => t.name).join(", ")) +
              "/" +
              dated(
                f.createdAt,
                "Feedback from " + f.author.name + " to " + f.targets.map((t) => t.name).join(", "),
              );
          if (area === "feedback" && f.entityId === key) return finish(file, d);
          if (add && !written.has(f.entityId)) written.set(f.entityId, await save(file, d.markdown));
          parts.push("- " + link(d.title, add ? written.get(f.entityId)! : origin + "/feedback/" + f.entityId));
        }
      }
      if (area === "feedback") throw new Error("Feedback not found in your visible feedback.");
    }
    if (section !== "feedback") {
      const cyclePage = async (after: string | null) =>
        (
          await query<{ viewer: { user: { cycles: Page<Cycle> } } }>(
            `($after:String){viewer{user{cycles:reviewCycles(first:25,after:$after,participantTypes:[reviewee,reviewerOnly]){${paging} edges{node{entityId name createdAt}}}}}}`,
            { after },
          )
        ).viewer.user.cycles;
      const cycles =
        area === "reviews"
          ? [
              (
                await query<{ viewer: { cycle: Cycle } }>(
                  "($cycle:String!){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){entityId name createdAt}}}",
                  { cycle: key! },
                )
              ).viewer.cycle,
            ]
          : await pages(await cyclePage(null), cyclePage);
      const teamPackets = new Map<string, Report[]>();
      if (!area) {
        const {
          viewer: {
            user: { reportsList },
          },
        } = await query<{ viewer: { user: { reportsList: { entityId: string }[] } } }>(
          "{viewer{user{reportsList{entityId}}}}",
        );
        for (const person of reportsList) {
          type TeamCycle = Cycle & { person: (Report & { visible: boolean }) | null };
          const teamPage = async (after: string | null) =>
            (
              await query<{ viewer: { person: { cycles: Page<TeamCycle> } } }>(
                `($person:String!,$after:String){viewer{person:findUser(userId:$person){cycles:reviewCycles(first:25,after:$after,participantTypes:[reviewee]){${paging} edges{node{entityId name createdAt person:findRevieweeByUserEntityId(entityId:$person){entityId user{name} visible:viewerCanViewManagerPDFReviewPacket}}}}}}}`,
                { person: person.entityId, after },
              )
            ).viewer.person.cycles;
          for (const cycle of await pages(await teamPage(null), teamPage)) {
            if (!cycle.person?.visible) continue;
            if (!cycles.some((c) => c.entityId === cycle.entityId)) cycles.push(cycle);
            if (!teamPackets.has(cycle.entityId)) teamPackets.set(cycle.entityId, []);
            teamPackets.get(cycle.entityId)!.push(cycle.person);
          }
        }
      }
      for (const c of cycles) {
        const cycleUrl = origin + "/reviews/" + c.entityId;
        const reqConnection = `{ ${paging} edges{node{${requestFields}}} }`;
        const {
          viewer: { cycle },
        } = await query<{
          viewer: { cycle: { groups: Group[]; viewerReviewee: { responsesReleasedAt: string | null } | null } };
        }>(
          `($cycle:String!){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){viewerReviewee{responsesReleasedAt} groups:viewerReviewGroupsToRespond{id requests:viewerReviewRequests(first:50)${reqConnection}}}}}`,
          { cycle: c.entityId },
        );
        parts.push("## " + c.name, "### Your review requests");
        const historicalReports = new Map<string, Report>();
        for (const group of cycle.groups) {
          const requests = await pages(group.requests, async (after) => {
            const {
              viewer: {
                cycle: { groups },
              },
            } = await query<{ viewer: { cycle: { groups: Group[] } } }>(
              `($cycle:String!,$after:String!){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){groups:viewerReviewGroupsToRespond{id requests:viewerReviewRequests(first:50,after:$after)${reqConnection}}}}}`,
              { cycle: c.entityId, after },
            );
            return groups.find((g) => g.id === group.id)!.requests;
          });
          for (const req of requests) {
            if (req.reviewGroup.type === "manager" && req.reviewee.viewerCanViewManagerPDFReviewPacket)
              historicalReports.set(req.reviewee.entityId, req.reviewee);
            if (action === "response" && req.entityId !== item) continue;
            const href =
              cycleUrl + "/participant/response/" + req.entityId + (req.status === "COMPLETE" ? "/completed" : "");
            const file =
              mine +
              "/" +
              segment(c.name) +
              "/Reviews I wrote/" +
              segment(req.reviewGroup.type) +
              "/" +
              dated(req.submittedAt ?? c.createdAt, "Review of " + req.reviewee.user.name);
            if (action === "response") return finish(file, await requestDoc(c, req.entityId));
            const local = add && (await save(file, (await requestDoc(c, req.entityId)).markdown));
            parts.push(
              "- " +
                link(viewer.name + " → " + req.reviewee.user.name, local ?? href) +
                " · " +
                req.reviewGroup.type +
                " · " +
                req.status,
            );
          }
        }
        if (action === "response") throw new Error("Review not found in your review requests.");
        if (action === "requests") continue;
        if (cycle.viewerReviewee?.responsesReleasedAt) {
          const local = add && (await packetDoc(c.entityId)).path.slice(base.length + 1);
          parts.push(
            "### Your released packet",
            link(viewer.name, local ?? cycleUrl + "/participant/reviewee-packet"),
          );
        }
        parts.push("### Direct reports");
        const reportPage = async (after: string | null) =>
          (
            await query<{ viewer: { cycle: { reports: Page<Report> } } }>(
              `($cycle:String!,$after:String){viewer{cycle:findReviewCycle(reviewCycleId:$cycle){reports:viewerDirectReportReviewees(first:50,after:$after){${paging} edges{node{entityId user{name}}}}}}}`,
              { cycle: c.entityId, after },
            )
          ).viewer.cycle.reports;
        for (const r of await pages(await reportPage(null), reportPage)) historicalReports.set(r.entityId, r);
        for (const r of teamPackets.get(c.entityId) ?? []) historicalReports.set(r.entityId, r);
        for (const r of historicalReports.values()) {
          const local = add && (await packetDoc(c.entityId, r.entityId)).path.slice(base.length + 1);
          parts.push("- " + link(r.user.name, local ?? cycleUrl + "/manager/direct-reports/" + r.entityId));
        }
      }
    }
    const index = !area
      ? "index"
      : area === "reviews"
        ? "Review requests"
        : section === "feedback"
          ? "feedback"
          : "reviews";
    const document = doc("Lattice — " + viewer.name, origin + path, parts);
    const file = index + ".md";
    return finish(file, document);
  } finally {
    await runtime.process.execute("playwright-cli", [...args, "detach"]);
  }
}

export const latticeService = defineService<RuntimeCapabilities>({
  name: "lattice",
  matches: (u) =>
    u.protocol === "https:" &&
    !u.port &&
    !u.username &&
    !u.password &&
    tenant.test(u.hostname) &&
    paths.test(u.pathname.replace(/\/$/, "") || "/"),
  parse: (u) => ({
    service: "lattice",
    identifier: u.hostname + u.pathname.replace(/\/$/, "") + (/^#review-[\da-f-]+$/i.test(u.hash) ? u.hash : ""),
    type: "document",
  }),
  fetch: (runtime, url) => read(runtime, new URL(url)),
  download: (runtime, url, _source, _write, add) =>
    add
      ? read(runtime, new URL(url), add)
      : Promise.reject(new Error("Lattice archives require an additive writer.")),
});
export const latticeProvider = Object.freeze({ services: [latticeService] as const });
