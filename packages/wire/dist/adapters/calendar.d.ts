import type { ProcessCapability } from "wire-core";
type Agenda = {
    date: string;
    timezone: string;
    events: {
        summary: string;
        calendar: string;
        calendar_id: string;
        start: string;
        end: string;
        all_day: boolean;
    }[];
};
export declare function readAgenda(process: ProcessCapability, root: string, date?: string, calendarId?: string): Promise<Agenda>;
export declare function formatAgenda(agenda: Agenda): string;
export {};
//# sourceMappingURL=calendar.d.ts.map