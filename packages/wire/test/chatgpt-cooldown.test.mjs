import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatgptCooldownError, createChatgptRequester, responseCooldown } from "../../provider-chatgpt/dist/cooldown.js";

const now = Date.parse("2026-09-01T12:00:00Z");

test("Retry-After seconds are honored exactly, without a capped or guessed delay", () => {
  const cooldown = responseCooldown(new Response(null, { status: 429, headers: { "retry-after": "3600" } }), now, 1, "/history");
  assert.equal(cooldown.delay_ms, 3600000);
  assert.equal(cooldown.retry_at, "2026-09-01T13:00:00.000Z");
  assert.equal(cooldown.source, "retry-after-seconds");
});

test("HTTP-date cooldowns account for server clock skew", () => {
  const cooldown = responseCooldown(new Response(null, { status: 429, headers: { "retry-after": "Tue, 01 Sep 2026 14:01:15 GMT", date: "Tue, 01 Sep 2026 14:00:00 GMT" } }), now, 1, "/history");
  assert.equal(cooldown.delay_ms, 75000);
  assert.equal(cooldown.retry_at, "2026-09-01T12:01:15.000Z");
  assert.equal(cooldown.source, "retry-after-date");
});

test("HTTP dates use local receipt time when the server omits Date", () => {
  const response = new Response(null, { status: 429, headers: { "retry-after": "Tue, 01 Sep 2026 12:02:00 GMT" } });
  assert.equal(responseCooldown(response, now, 1, "/history").delay_ms, 120000);
  assert.equal(responseCooldown(response, now + 180000, 1, "/history").delay_ms, 0);
});

test("missing and malformed Retry-After values explicitly use exponential fallback", () => {
  for (const value of [null, "invalid", "-1", "1.5", "999999999999999999999"]) {
    const response = new Response(null, { status: 429, headers: value === null ? {} : { "retry-after": value } });
    const cooldown = responseCooldown(response, now, 3, "/history");
    assert.equal(cooldown.delay_ms, 4000);
    assert.equal(cooldown.source, "exponential-backoff");
  }
});

test("requester sleeps to the server deadline and retries only the failed request", async () => {
  let time = now;
  const calls = [];
  const sleeps = [];
  const events = [];
  const request = createChatgptRequester({ request: async (url) => {
    calls.push({ url, time });
    return calls.length === 1 ? new Response(null, { status: 429, headers: { "retry-after": "90" } }) : Response.json({ ok: true });
  } }, async event => { events.push(event); }, { now: () => time, sleep: async delay => { sleeps.push(delay); time += delay; } });
  await request("https://chatgpt.com/backend-api/history", {}, "/history");
  await request("https://chatgpt.com/backend-api/next", {}, "/next");
  assert.deepEqual(sleeps, [90000]);
  assert.deepEqual(calls.map(call => call.time), [now, now + 90000, now + 90000]);
  assert.equal(events[0].source, "retry-after-seconds");
});

test("early timer wakeups cannot cause a request before the cooldown expires", async () => {
  let time = now;
  let calls = 0;
  const sleeps = [];
  const request = createChatgptRequester({ request: async () => ++calls === 1 ? new Response(null, { status: 429, headers: { "retry-after": "2" } }) : Response.json({ ok: true }) }, async () => {}, {
    now: () => time,
    sleep: async duration => { sleeps.push(duration); time += sleeps.length === 1 ? 1000 : duration; },
  });
  await request("https://chatgpt.com/backend-api/history", {}, "/history");
  assert.deepEqual(sleeps, [2000, 1000]);
  assert.equal(time, now + 2000);
});

test("persistent rate limiting stops the entire requester rather than hammering other endpoints", async () => {
  let time = now;
  let calls = 0;
  const sleeps = [];
  const request = createChatgptRequester({ request: async () => { calls++; return new Response(null, { status: 429, headers: { "retry-after": "10" } }); } }, async () => {}, {
    now: () => time,
    sleep: async duration => { sleeps.push(duration); time += duration; },
  });
  await assert.rejects(request("https://chatgpt.com/backend-api/history", {}, "/history"), error => error instanceof ChatgptCooldownError && error.cooldown.retry_at === "2026-09-01T12:00:50.000Z");
  await assert.rejects(request("https://chatgpt.com/backend-api/other", {}, "/other"), ChatgptCooldownError);
  assert.equal(calls, 5);
  assert.deepEqual(sleeps, [10000, 10000, 10000, 10000]);
});

test("permanent client errors are not retried or disguised as rate limits", async () => {
  let calls = 0;
  const request = createChatgptRequester({ request: async () => { calls++; return new Response(null, { status: 422 }); } }, async () => { assert.fail("unexpected cooldown"); });
  assert.equal((await request("https://chatgpt.com/backend-api/history", {}, "/history")).status, 422);
  assert.equal(calls, 1);
});
