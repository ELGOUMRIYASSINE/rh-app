import { type DateStr, dayIndex, type LocalMinutes, MINUTES_PER_DAY } from "@yghr/core";

/** Wall-clock parts of an instant in a timezone. */
function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}

/** UTC instant → org-local wall-clock minutes. */
export function toLocal(date: Date, timeZone: string): LocalMinutes {
  const p = partsInTz(date, timeZone);
  return dayIndex(p.date) * MINUTES_PER_DAY + p.hour * 60 + p.minute + p.second / 60;
}

/** Org-local wall-clock minutes → UTC instant. */
export function fromLocal(t: LocalMinutes, timeZone: string): Date {
  const guess = new Date(t * 60_000);
  // offset = local − utc at that instant; two passes handle DST edges.
  let ms = guess.getTime();
  for (let i = 0; i < 2; i++) {
    const offset = toLocal(new Date(ms), timeZone) - ms / 60_000;
    ms = (t - offset) * 60_000;
  }
  return new Date(Math.round(ms));
}

/** Today's date in the org timezone. */
export function todayIn(timeZone: string, now = new Date()): DateStr {
  return partsInTz(now, timeZone).date;
}

export function localDateTimeToUtc(date: DateStr, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return fromLocal(dayIndex(date) * MINUTES_PER_DAY + h * 60 + m, timeZone);
}

/** @db.Date helpers: a DateStr is stored as UTC midnight. */
export function dbDate(d: DateStr): Date {
  return new Date(`${d}T00:00:00.000Z`);
}
export function fromDbDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

/** "07:42" in org tz */
export function formatLocalTime(date: Date, timeZone: string): string {
  const p = partsInTz(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
