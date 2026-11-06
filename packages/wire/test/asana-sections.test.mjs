import assert from "node:assert/strict";
import test from "node:test";
import { moveAsanaTask, showAsanaProject } from "provider-asana";

const focus = { gid: "20", name: "Focus" };
const box = { gid: "21", name: "Box" };
function api({ sections = [box, focus], memberships = [{ project: { gid: "1" }, section: box }] } = {}) {
  const writes = [];
  const runtime = {
    cookies: { loadSaved: async () => [] },
    http: { request: async (url, init) => {
      const path = url.pathname.replace("/api/1.0", "");
      if (init.method === "POST") {
        writes.push([path, JSON.parse(init.body).data]);
        return Response.json({ data: {} });
      }
      if (path === "/projects/1") return Response.json({ data: { gid: "1", name: "Example", permalink_url: "https://example.com" } });
      if (path === "/projects/1/sections") {
        const second = url.searchParams.has("offset");
        return Response.json(second ? { data: sections.slice(1), next_page: null } : { data: sections.slice(0, 1), next_page: { offset: "next" } });
      }
      assert.equal(path, "/tasks/9");
      return Response.json({ data: { memberships } });
    } },
  };
  return { runtime, writes };
}

test("project show includes every section in project order without reading tasks", async () => {
  assert.deepEqual(await showAsanaProject(api().runtime, "1"), {
    gid: "1", name: "Example", permalink_url: "https://example.com", sections: [box, focus],
  });
});

test("move resolves the section on a later page and alters only this project's placement", async () => {
  const { runtime, writes } = api({ memberships: [{ project: { gid: "2" }, section: { gid: "25" } }, { project: { gid: "1" }, section: null }] });
  assert.deepEqual(await moveAsanaTask(runtime, "9", "1", "focus"), { task: "9", project: "1", section: focus });
  assert.deepEqual(writes, [["/sections/20/addTask", { task: "9" }]]);
});

test("move won't reorder a task already in the section or add a task from a different project", async () => {
  const placed = api();
  await moveAsanaTask(placed.runtime, "9", "1", box.gid);
  assert.deepEqual(placed.writes, []);
  const outside = api({ memberships: [{ project: { gid: "4" }, section: box }] });
  await assert.rejects(moveAsanaTask(outside.runtime, "9", "1", box.name), /not in project 1/);
  assert.deepEqual(outside.writes, []);
});

test("an unknown or ambiguous section fails before writes; the ID disambiguates", async () => {
  const { runtime, writes } = api({ sections: [focus, { gid: "22", name: "Focus" }] });
  await assert.rejects(moveAsanaTask(runtime, "9", "1", "Other"), /No section "Other".*projects show 1/);
  await assert.rejects(moveAsanaTask(runtime, "9", "1", focus.name), /Multiple sections.*use a section ID/);
  assert.deepEqual(writes, []);
  await moveAsanaTask(runtime, "9", "1", "22");
  assert.deepEqual(writes, [["/sections/22/addTask", { task: "9" }]]);
});
