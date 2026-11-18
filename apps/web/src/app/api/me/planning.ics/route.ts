import { addDays } from "@yghr/core";
import { localDateTimeToUtc, todayIn } from "@yghr/db";
import { fail, route } from "@/server/api";
import { myShifts } from "@/server/me";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** My published shifts (−7 / +60 days) as an iCalendar file. */
export const GET = route({ allowEmployee: true }, async ({ s }) => {
  if (!s.employeeId) fail(400, "Aucune fiche salarié liée à votre compte.");
  const today = todayIn(s.org.timezone);
  const { shifts } = await myShifts(s.org.id, s.employeeId!, addDays(today, -7), addDays(today, 60));
  const events = shifts.map((x) => {
    const start = localDateTimeToUtc(x.date, x.start, s.org.timezone);
    const end = localDateTimeToUtc(x.end <= x.start ? addDays(x.date, 1) : x.date, x.end, s.org.timezone);
    return ["BEGIN:VEVENT", `UID:${x.id}@yghr`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${x.name} (${x.code})`, `DESCRIPTION:${s.org.name.replace(/[,;]/g, " ")}`, "END:VEVENT"].join("\r\n");
  });
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YGHR//Planning//FR", "CALSCALE:GREGORIAN", `X-WR-CALNAME:Planning ${s.org.name}`, ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="mon-planning.ics"' } });
});
