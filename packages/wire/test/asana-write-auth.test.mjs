import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { editAsanaTask, listAsanaTasks } from "provider-asana";
import { createExecutableRoot } from "../dist/executable.js";

test("Asana creation inherits home credentials and allows workspace overrides", async (t) => {
  const root = resolve(import.meta.dirname, "../../../out/asana-config-auth");
  const home = join(root, "home");
  const project = join(root, "project");
  const homeToken = join(home, "token.env");
  const projectToken = join(project, "token.env");
  await rm(root, { recursive: true, force: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(home, ".wire/auth"), { recursive: true });
  await mkdir(join(project, ".wire"), { recursive: true });
  await writeFile(homeToken, "ASANA_ACCESS_TOKEN=home-token\n");
  await writeFile(projectToken, "ASANA_ACCESS_TOKEN=project-token\n");
  await writeFile(join(home, ".wire/config.json"), JSON.stringify({ env: { ASANA_TOKEN_FILE: homeToken } }));
  await writeFile(join(home, ".wire/auth/asana_cookies.txt"), ".asana.com\tTRUE\t/\tTRUE\t0\tticket\tcookie\n");
  let expectedToken;
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (init.method === "GET") {
      assert.equal(url.pathname, "/api/1.0/projects/1/sections");
      assert.equal(init.headers.Cookie, "ticket=cookie");
      assert.equal(init.headers.Authorization, undefined);
      return Response.json({ data: [{ gid: "3", name: "Untitled section" }], next_page: null });
    }
    posts++;
    assert.equal(url.pathname, "/api/1.0/tasks");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Cookie, undefined);
    assert.equal(init.headers.Authorization, `Bearer ${expectedToken}`);
    assert.deepEqual(JSON.parse(init.body).data, {
      name: "Ship", projects: ["1"], memberships: [{ project: "1", section: "3" }],
      html_notes: "<body>Ready</body>",
    });
    return Response.json({ data: { gid: "2", memberships: [{ project: { gid: "1" }, section: { gid: "3" } }] } });
  });
  for (const [config, token] of [[{}, "home-token"], [{ env: { UNRELATED: "value" } }, "home-token"], [{ env: { ASANA_TOKEN_FILE: projectToken } }, "project-token"]]) {
    await writeFile(join(project, ".wire/config.json"), JSON.stringify(config));
    expectedToken = token;
    const executable = createExecutableRoot({ HOME: home }, project);
    const asana = executable.children.find(command => command.name === "asana");
    const tasks = asana.children.find(command => command.name === "tasks");
    const create = tasks.children.find(command => command.name === "create");
    const task = await create.handler({ params: { project: "1", section: "3", title: "Ship", body: "Ready" } });
    assert.equal(task.gid, "2");
  }
  assert.equal(posts, 3);
});

test("reads keep cookie auth; writes use the configured token without sending cookies", async () => {
  for (const env of [{ ASANA_ACCESS_TOKEN: "explicit", ASANA_TOKEN_FILE: "unused" }, { ASANA_TOKEN_FILE: "credential-file" }]) {
    const expectedToken = env.ASANA_ACCESS_TOKEN ?? "from-file";
    const runtime = {
      configuration: { getOptional: key => env[key] },
      filesystem: { readText: async path => { assert.equal(path, "credential-file"); return 'ASANA_ACCESS_TOKEN="from-file"\n'; } },
      cookies: { loadSaved: async () => [{ name: "ticket", value: "cookie" }] },
      http: { request: async (url, init) => {
        if (init.method === "GET") {
          assert.equal(init.headers.Cookie, "ticket=cookie");
          assert.equal(init.headers.Authorization, undefined);
          return Response.json({ data: [], next_page: null });
        }
        assert.equal(init.headers.Cookie, undefined);
        assert.equal(init.headers.Authorization, `Bearer ${expectedToken}`);
        return Response.json({ data: { gid: "1" } });
      } },
    };
    await listAsanaTasks(runtime, "1");
    await editAsanaTask(runtime, "1", { name: "Changed" });
  }
});

test("cookie write rejection recommends a token, invalid tokens never fall back to cookie writes", async () => {
  for (const token of [undefined, "rejected-token"]) {
    let calls = 0;
    const runtime = { configuration: { getOptional: key => key === "ASANA_ACCESS_TOKEN" ? token : undefined },
      cookies: { loadSaved: async () => [{ name: "ticket", value: "cookie" }] },
      http: { request: async () => { calls++; return new Response(null, { status: 401 }); } } };
    await assert.rejects(editAsanaTask(runtime, "1", { name: "Changed" }), token ? /Asana rejected ASANA_ACCESS_TOKEN/ : /Set ASANA_ACCESS_TOKEN/);
    assert.equal(calls, 1);
  }
});
