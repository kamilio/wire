import assert from "node:assert/strict";
import test from "node:test";
import { formatAgenda, readAgenda } from "../dist/adapters/calendar.js";

test("the agenda invokes only the read script and renders all entries", async () => {
  const events = [
    { summary: "Away", all_day: true, calendar: "Team" },
    { summary: "One", start: "09:00", end: "10:00", all_day: false, calendar: "Personal" },
    { summary: "Two", start: "09:30", end: "10:30", all_day: false, calendar: "Team" },
  ];
  const data = { date: "2026-11-10", timezone: "America/Chicago", events };
  const process = { execute: async (command, args) => {
    assert.equal(command, "/scripts/google_calendar_agenda.py");
    assert.deepEqual(args, ["--json", "--date=2026-11-10", "--calendar-id=shared@example.com"]);
    return { stdout: JSON.stringify(data) };
  } };
  const agenda = await readAgenda(process, "/scripts", data.date, "shared@example.com");
  assert.deepEqual(agenda, data);
  assert.equal(formatAgenda(agenda), "# Agenda: 2026-11-10 (America/Chicago)\n- All day: Away (Team)\n- 09:00 – 10:00: One (Personal)\n- 09:30 – 10:30: Two (Team)");
});

test("Calendar helper diagnostics are never forwarded", async () => {
  const process = { execute: async () => { throw new Error("private response body"); } };
  await assert.rejects(readAgenda(process, "/scripts"), error => error.message.startsWith("Could not read the agenda") && !error.message.includes("private"));
});
