import assert from "node:assert/strict";
import test from "node:test";
import { listDocComments } from "../dist/adapters/doc-comments.js";
import { createRoot } from "../dist/adapters/root.js";
import { createFakeWire } from "./support/fake-wire.mjs";

test("comment pages include resolved threads and replies without changing the document", async () => {
  const url = "https://docs.google.com/document/d/doc/edit";
  const thread = { id: "a", author: { displayName: "Reviewer" }, content: "Why?", resolved: false, replies: [] };
  const runtime = { googleFormsTokens: { load: async () => ({ token: "test" }) }, http: { request: async input => {
    const u = new URL(input);
    assert.equal(u.pathname, "/drive/v3/files/doc/comments");
    return Response.json(u.searchParams.get("pageToken") === "p2" ? { comments: [{ ...thread, id: "b", resolved: true,
      replies: [{ author: { displayName: "Writer" }, content: "Fixed" }] }] } : { nextPageToken: "p2", comments: [thread] });
  } } };
  const wire = { ...createFakeWire(), showResource: async () => ({ urls: [url] }) };
  const root = createRoot(wire, ".", undefined, undefined, { allowPaste: false, listDocComments: u => listDocComments(runtime, u) });
  for (const name of ["preview", "sync"]) {
    const cmd = root.children.find(c => c.name === name);
    const result = await cmd.handler({ params: { url, resource: "Doc.md", comments: true } });
    assert.deepEqual(cmd.render.json(result).comments.map(c => c.resolved), [false, true]);
    assert.match(cmd.render.markdown(result), /Resolved · .*disco=b[\s\S]*Writer: Fixed/);
    assert.doesNotMatch(result.markdown, /Reviewer|Fixed/);
  }
});

test("a failed comment fetch aborts before two-way sync", async () => {
  const wire = { ...createFakeWire(), sync: () => assert.fail("unexpected sync") };
  const root = createRoot(wire, ".", undefined, undefined, { allowPaste: false, listDocComments: async () => { throw Error("Access denied"); } });
  await assert.rejects(root.children.find(c => c.name === "sync").handler({ params: { resource: "Doc.md", comments: true } }), /Access denied/);
});
