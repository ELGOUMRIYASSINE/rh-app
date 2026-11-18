/**
 * Time primitives.
 *
 * DECISION: the core works on *local wall-clock time* of the organisation.
 * A `LocalMinutes` value is the number of minutes since 1970-01-01T00:00 in the
 * organisation's timezone, ignoring DST. Conversion from UTC instants (punches,
 * database timestamps) to local wall time happens at the edges (apps/web, worker)
 * with date-fns-tz. This keeps every rule deterministic and trivially testable,
 * and shift definitions ("07:00–19:00") are wall-clock by nature.
 */

/** "YYYY-MM-DD" */
export type DateStr = string;
/** Minutes since 1970-01-01T00:00 local wall-clock time. */
export type LocalMinutes = number;

export interface Interval {
  start: LocalMinutes;
  end: LocalMinutes;
}

export const MINUTES_PER_DAY = 1440;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(hhmm: string): boolean {
  return TIME_RE.test(hhmm);
}

/** "07:30" → 450 */
export function parseTime(hhmm: string): number {
  const m = TIME_RE.exec(hhmm);
  if (!m) throw new Error(`Heure invalide : ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 450 → "07:30" (wraps around the day) */
export function formatTime(minutesOfDay: number): string {
  const m = ((Math.round(minutesOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 545 → "9h05" ; 600 → "10h00" */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

/** Day number since epoch for a date string. */
export function dayIndex(date: DateStr): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Date invalide : ${date}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export function fromDayIndex(idx: number): DateStr {
  return new Date(idx * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: DateStr, n: number): DateStr {
  return fromDayIndex(dayIndex(date) + n);
}

export function diffDays(a: DateStr, b: DateStr): number {
  return dayIndex(a) - dayIndex(b);
}

/** Inclusive list of dates. */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let i = dayIndex(from); i <= dayIndex(to); i++) out.push(fromDayIndex(i));
  return out;
}

/** 0 = Sunday … 6 = Saturday (JS convention, used everywhere in YGHR). */
export function weekday(date: DateStr): number {
  // 1970-01-01 was a Thursday (4)
  return (((dayIndex(date) + 4) % 7) + 7) % 7;
}

/** Monday of the ISO week containing `date`. */
export function startOfIsoWeek(date: DateStr): DateStr {
  const wd = weekday(date);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(date, offset);
}

export function isoWeek(date: DateStr): { year: number; week: number } {
  // Thursday of the current week decides the ISO year.
  const thursday = addDays(startOfIsoWeek(date), 3);
  const year = Number(thursday.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week1Monday = startOfIsoWeek(jan4);
  const week = Math.floor(diffDays(thursday, week1Monday) / 7) + 1;
  return { year, week };
}

/** ISO weeks overlapping [from, to], in order. */
export function isoWeeksInRange(
  from: DateStr,
  to: DateStr,
): { key: string; year: number; week: number; start: DateStr; end: DateStr }[] {
  const out: { key: string; year: number; week: number; start: DateStr; end: DateStr }[] = [];
  let monday = startOfIsoWeek(from);
  while (dayIndex(monday) <= dayIndex(to)) {
    const { year, week } = isoWeek(monday);
    out.push({ key: `${year}-W${String(week).padStart(2, "0")}`, year, week, start: monday, end: addDays(monday, 6) });
    monday = addDays(monday, 7);
  }
  return out;
}

export function toLocalMinutes(date: DateStr, hhmm: string): LocalMinutes {
  return dayIndex(date) * MINUTES_PER_DAY + parseTime(hhmm);
}

export function localDateOf(t: LocalMinutes): DateStr {
  return fromDayIndex(Math.floor(t / MINUTES_PER_DAY));
}

export function minutesOfDay(t: LocalMinutes): number {
  return ((t % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Build a wall-clock interval anchored on `date`.
 * When `end <= start` the interval ends the next day (night shifts).
 */
export function anchoredInterval(date: DateStr, start: string, end: string): Interval {
  const s = toLocalMinutes(date, start);
  let e = toLocalMinutes(date, end);
  if (e <= s) e += MINUTES_PER_DAY;
  return { start: s, end: e };
}

export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function intervalLength(i: Interval): number {
  return Math.max(0, i.end - i.start);
}

/**
 * Minutes of `interval` that fall into the organisation's night window
 * (e.g. 21:00 → 06:00, which crosses midnight).
 */
export function nightMinutes(interval: Interval, nightStart: string, nightEnd: string): number {
  if (interval.end <= interval.start) return 0;
  const firstDay = Math.floor(interval.start / MINUTES_PER_DAY) - 1;
  const lastDay = Math.floor(interval.end / MINUTES_PER_DAY);
  const ns = parseTime(nightStart);
  const ne = parseTime(nightEnd);
  if (ns === ne) return 0;
  let total = 0;
  for (let d = firstDay; d <= lastDay; d++) {
    const base = d * MINUTES_PER_DAY;
    const window: Interval =
      ne > ns ? { start: base + ns, end: base + ne } : { start: base + ns, end: base + MINUTES_PER_DAY + ne };
    total += overlapMinutes(interval, window);
  }
  return total;
}

/** Union length of possibly-overlapping intervals. */
export function unionLength(intervals: Interval[]): number {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let cur: Interval | null = null;
  for (const i of sorted) {
    if (!cur || i.start > cur.end) {
      if (cur) total += cur.end - cur.start;
      cur = { ...i };
    } else cur.end = Math.max(cur.end, i.end);
  }
  if (cur) total += cur.end - cur.start;
  return total;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "Lundi 16 novembre 2026" */
const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
export function monthNameFr(month1to12: number): string {
  return MONTHS_FR[month1to12 - 1] ?? "";
}
export function weekdayNameFr(wd: number): string {
  return WEEKDAYS_FR[wd] ?? "";
}
export function formatLongDateFr(date: DateStr): string {
  const wd = WEEKDAYS_FR[weekday(date)]!;
  const [y, m, d] = date.split("-");
  const s = `${wd} ${Number(d)} ${MONTHS_FR[Number(m) - 1]} ${y}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
