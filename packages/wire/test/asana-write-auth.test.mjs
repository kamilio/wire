import assert from "node:assert/strict";
import test from "node:test";
import { editAsanaTask, listAsanaTasks } from "provider-asana";

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
