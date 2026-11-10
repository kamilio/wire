import { join } from "node:path";
import { UserError } from "toolcraft";
import type { ProcessCapability } from "wire-core";

type Agenda = {
  date: string;
  timezone: string;
  events: { summary: string; calendar: string; calendar_id: string; start: string; end: string; all_day: boolean }[];
};

export async function readAgenda(process: ProcessCapability, root: string, date?: string, calendarId?: string): Promise<Agenda> {
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Use YYYY-MM-DD for the agenda date.");
  const args = ["--json"];
  if (date !== undefined) args.push(`--date=${date}`);
  if (calendarId !== undefined) args.push(`--calendar-id=${calendarId}`);
  try {
    const result = await process.execute(join(root, "google_calendar_agenda.py"), args);
    return JSON.parse(result.stdout);
  } catch {
    throw new UserError("Could not read the agenda. Check the Calendar script, saved authorization, date, and calendar ID.");
  }
}

export function formatAgenda(agenda: Agenda): string {
  const lines = [`# Agenda: ${agenda.date} (${agenda.timezone})`];
  for (const event of agenda.events) {
    const when = event.all_day ? "All day" : `${event.start} – ${event.end}`;
    lines.push(`- ${when}: ${event.summary} (${event.calendar})`);
  }
  if (!agenda.events.length) lines.push("No events.");
  return lines.join("\n");
}
