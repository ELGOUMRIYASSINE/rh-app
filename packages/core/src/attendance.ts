import type { ResolvedShift } from "./shifts";
import { type DateStr, type Interval, localDateOf, type LocalMinutes, nightMinutes, overlapMinutes } from "./time";

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE" | "OFF" | "DONE";

export interface PunchPair {
  in: LocalMinutes;
  out: LocalMinutes | null;
}

export interface AttendanceOptions {
  /** Punches closer than this are duplicates (double scan). */
  dedupeMinutes?: number;
  /** An IN without OUT for longer than this is closed as "missing out". */
  maxPairMinutes?: number;
  /** Window around a planned shift used to attach punches to it. */
  attachWindowMinutes?: number;
}

const DEFAULTS: Required<AttendanceOptions> = { dedupeMinutes: 2, maxPairMinutes: 16 * 60, attachWindowMinutes: 4 * 60 };

export function dedupePunches(punches: LocalMinutes[], dedupeMinutes = DEFAULTS.dedupeMinutes): LocalMinutes[] {
  const sorted = [...punches].sort((a, b) => a - b);
  const out: LocalMinutes[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || p - last > dedupeMinutes) out.push(p);
  }
  return out;
}

/**
 * Pair punches chronologically into IN/OUT. The device in/out flag is a hint only, so we
 * alternate; a gap longer than `maxPairMinutes` closes the open pair as "missing out".
 */
export function pairPunches(punches: LocalMinutes[], opts: AttendanceOptions = {}): PunchPair[] {
  const o = { ...DEFAULTS, ...opts };
  const list = dedupePunches(punches, o.dedupeMinutes);
  const pairs: PunchPair[] = [];
  let open: LocalMinutes | null = null;
  for (const p of list) {
    if (open === null) open = p;
    else if (p - open > o.maxPairMinutes) {
      pairs.push({ in: open, out: null });
      open = p;
    } else {
      pairs.push({ in: open, out: p });
      open = null;
    }
  }
  if (open !== null) pairs.push({ in: open, out: null });
  return pairs;
}

/**
 * Attach each pair to a work date: the planned shift it overlaps most (or is nearest to within
 * the attach window), else the local date of its IN. A shift crossing midnight belongs to its start day.
 */
export function assignPairsToDates(
  pairs: PunchPair[],
  shifts: ResolvedShift[],
  opts: AttendanceOptions = {},
): Map<DateStr, PunchPair[]> {
  const o = { ...DEFAULTS, ...opts };
  const out = new Map<DateStr, PunchPair[]>();
  for (const pair of pairs) {
    const span: Interval = { start: pair.in, end: pair.out ?? pair.in + 1 };
    let best: { date: DateStr; score: number } | null = null;
    for (const s of shifts) {
      const win: Interval = { start: s.interval.start - o.attachWindowMinutes, end: s.interval.end + o.attachWindowMinutes };
      if (overlapMinutes(span, win) <= 0) continue;
      const score = overlapMinutes(span, s.interval) * 10_000 - Math.abs(pair.in - s.interval.start);
      if (!best || score > best.score) best = { date: s.date, score };
    }
    const date = best?.date ?? localDateOf(pair.in);
    out.set(date, [...(out.get(date) ?? []), pair]);
  }
  return out;
}

export interface DayAttendanceInput {
  date: DateStr;
  /** Planned shifts on that date (already resolved). */
  shifts: ResolvedShift[];
  pairs: PunchPair[];
  nightWindow: { start: string; end: string };
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes?: number;
  onLeave?: boolean;
  /** Current local time, for live status. Omit for closed days. */
  now?: LocalMinutes;
}

export type AttendanceIssue = "MISSING_OUT" | "PUNCH_WITHOUT_SHIFT" | "ABSENT" | "LATE" | "EARLY_LEAVE";

export interface DayAttendance {
  date: DateStr;
  firstIn: LocalMinutes | null;
  lastOut: LocalMinutes | null;
  workedMinutes: number;
  nightMinutes: number;
  normalMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  plannedMinutes: number;
  status: AttendanceStatus;
  issues: AttendanceIssue[];
}

export function computeDayAttendance(input: DayAttendanceInput): DayAttendance {
  const { shifts, pairs } = input;
  const sortedPairs = [...pairs].sort((a, b) => a.in - b.in);
  const firstIn = sortedPairs[0]?.in ?? null;
  const closed = sortedPairs.filter((p) => p.out !== null);
  const lastOut = closed.length ? Math.max(...closed.map((p) => p.out!)) : null;

  let worked = 0;
  let night = 0;
  for (const p of sortedPairs) {
    const end = p.out ?? (input.now !== undefined && input.now > p.in ? input.now : null);
    if (end === null) continue;
    const iv = { start: p.in, end };
    worked += end - p.in;
    night += nightMinutes(iv, input.nightWindow.start, input.nightWindow.end);
  }
  // DECISION: unpaid planned breaks are deducted from worked time when the employee worked the shift span.
  const plannedBreak = shifts.filter((s) => !s.breakPaid).reduce((t, s) => t + s.breakMinutes, 0);
  const plannedMinutes = shifts.reduce((t, s) => t + s.duration, 0);
  if (plannedBreak && worked > plannedBreak * 2) {
    const ratio = night / worked;
    worked -= plannedBreak;
    night = Math.round(worked * ratio);
  }

  const issues: AttendanceIssue[] = [];
  if (sortedPairs.some((p) => p.out === null) && input.now === undefined) issues.push("MISSING_OUT");
  if (sortedPairs.length && !shifts.length) issues.push("PUNCH_WITHOUT_SHIFT");

  const firstShift = [...shifts].sort((a, b) => a.interval.start - b.interval.start)[0];
  const lastShift = [...shifts].sort((a, b) => b.interval.end - a.interval.end)[0];
  let late = 0;
  if (firstShift && firstIn !== null) {
    const delay = firstIn - firstShift.interval.start;
    // Lateness counts only above the tolerance, and then counts in full.
    if (delay > input.lateToleranceMinutes) late = delay;
  }
  let early = 0;
  if (lastShift && lastOut !== null && !sortedPairs.some((p) => p.out === null)) {
    const adv = lastShift.interval.end - lastOut;
    if (adv > (input.earlyLeaveToleranceMinutes ?? 0)) early = adv;
  }
  if (late) issues.push("LATE");
  if (early) issues.push("EARLY_LEAVE");

  let status: AttendanceStatus;
  if (input.onLeave) status = "LEAVE";
  else if (!shifts.length && !sortedPairs.length) status = "OFF";
  else if (sortedPairs.some((p) => p.out === null) && input.now !== undefined) status = late ? "LATE" : "PRESENT";
  else if (sortedPairs.length) status = late ? "LATE" : "DONE";
  else {
    // planned but no punch
    const start = firstShift!.interval.start;
    if (input.now === undefined || input.now > start + input.lateToleranceMinutes) {
      status = "ABSENT";
      issues.push("ABSENT");
    } else status = "OFF";
  }

  return {
    date: input.date,
    firstIn,
    lastOut,
    workedMinutes: Math.max(0, worked),
    nightMinutes: Math.max(0, night),
    normalMinutes: Math.max(0, worked - night),
    lateMinutes: late,
    earlyLeaveMinutes: early,
    plannedMinutes,
    status,
    issues,
  };
}

/**
 * Live board status: "Présent = entré et pas encore sorti (le statut passe en absent dès que la sortie est pointée)".
 */
export function liveStatus(pairs: PunchPair[], hasShiftToday: boolean, onLeave: boolean, late: boolean): "PRESENT" | "LATE" | "ABSENT" | "LEAVE" | "OFF" {
  if (onLeave) return "LEAVE";
  const open = pairs.some((p) => p.out === null);
  if (open) return late ? "LATE" : "PRESENT";
  if (!hasShiftToday && !pairs.length) return "OFF";
  return "ABSENT";
}

/** Weekly overtime: minutes above the threshold or the contract hours (whichever is lower). */
export function weeklyOvertimeMinutes(workedMinutes: number, thresholdHours: number, contractWeeklyHours?: number | null): number {
  const limit = Math.min(thresholdHours, contractWeeklyHours ?? thresholdHours) * 60;
  return Math.max(0, workedMinutes - limit);
}
