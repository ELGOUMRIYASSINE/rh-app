import { anchoredInterval, type DateStr, type Interval, intervalLength, nightMinutes, parseTime } from "./time";

export interface ShiftTypeDef {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  breakPaid: boolean;
  isNight: boolean;
  staffCategoryId?: string | null;
  color?: string;
}

export interface AssignmentDef {
  id: string;
  employeeId: string;
  date: DateStr;
  shiftTypeId?: string | null;
  customStart?: string | null;
  customEnd?: string | null;
  breakMinutes?: number | null;
}

/** True when the shift ends the day after it starts. */
export function endsNextDay(startTime: string, endTime: string): boolean {
  return parseTime(endTime) <= parseTime(startTime);
}

/** Amplitude in minutes (start → end, crossing midnight when needed). */
export function amplitudeMinutes(startTime: string, endTime: string): number {
  const s = parseTime(startTime);
  let e = parseTime(endTime);
  if (e <= s) e += 1440;
  return e - s;
}

/** duration = amplitude − unpaid break */
export function shiftDurationMinutes(def: Pick<ShiftTypeDef, "startTime" | "endTime" | "breakMinutes" | "breakPaid">): number {
  const amp = amplitudeMinutes(def.startTime, def.endTime);
  return Math.max(0, amp - (def.breakPaid ? 0 : def.breakMinutes));
}

export interface ResolvedShift {
  assignmentId: string;
  employeeId: string;
  date: DateStr;
  shiftTypeId: string | null;
  code: string;
  name: string;
  interval: Interval;
  amplitude: number;
  breakMinutes: number;
  breakPaid: boolean;
  /** Paid minutes (amplitude − unpaid break). */
  duration: number;
  isNight: boolean;
}

/**
 * Turn a planning cell into a concrete interval. Custom hours win over the shift type.
 * DECISION: a custom shift is considered "night" when at least half of it falls in the night window.
 */
export function resolveAssignment(
  a: AssignmentDef,
  shiftTypes: Map<string, ShiftTypeDef>,
  night: { start: string; end: string } = { start: "21:00", end: "06:00" },
): ResolvedShift | null {
  const st = a.shiftTypeId ? shiftTypes.get(a.shiftTypeId) : undefined;
  const start = a.customStart ?? st?.startTime;
  const end = a.customEnd ?? st?.endTime;
  if (!start || !end) return null;
  const interval = anchoredInterval(a.date, start, end);
  const amplitude = intervalLength(interval);
  const breakMinutes = a.breakMinutes ?? st?.breakMinutes ?? 0;
  const breakPaid = st?.breakPaid ?? false;
  const duration = Math.max(0, amplitude - (breakPaid ? 0 : breakMinutes));
  const isNight =
    a.customStart || a.customEnd
      ? nightMinutes(interval, night.start, night.end) * 2 >= amplitude
      : (st?.isNight ?? false);
  return {
    assignmentId: a.id,
    employeeId: a.employeeId,
    date: a.date,
    shiftTypeId: st?.id ?? null,
    code: st?.code ?? "PERSO",
    name: st?.name ?? "Horaire personnalisé",
    interval,
    amplitude,
    breakMinutes,
    breakPaid,
    duration,
    isNight,
  };
}

/** Paid minutes split into normal / night for a shift (unpaid break removed proportionally). */
export function splitShiftMinutes(s: ResolvedShift, nightStart: string, nightEnd: string): { normal: number; night: number } {
  if (s.amplitude === 0) return { normal: 0, night: 0 };
  const nightAmp = nightMinutes(s.interval, nightStart, nightEnd);
  const ratio = s.duration / s.amplitude;
  const night = Math.round(nightAmp * ratio);
  return { normal: s.duration - night, night };
}
