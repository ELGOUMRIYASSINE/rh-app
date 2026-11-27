import {
  addDays,
  assignPairsToDates,
  computeDayAttendance,
  type DateStr,
  pairPunches,
  resolveAssignment,
  resolveRule,
  type ResolvedShift,
} from "@yghr/core";
import type { PrismaClient } from "../generated/prisma/client";
import { dbDate, fromDbDate, fromLocal, toLocal, todayIn } from "../tz";
import { toShiftTypeDef, toWorkRuleDef } from "./planning";

export type LiveStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE" | "OFF" | "DONE";

export interface LiveRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  isLead: boolean;
  serviceName: string | null;
  status: LiveStatus;
  planned: { code: string; name: string; start: string; end: string; color: string }[];
  firstIn: string | null;
  lastPunch: string | null;
  /** Start of the currently open presence (for the live timer). */
  openSince: string | null;
  workedMinutes: number;
  lateMinutes: number;
}

/**
 * Real-time presence board for a date. "Présent = entré et pas encore sorti" —
 * the status becomes absent as soon as the exit is punched (DONE is shown as absent / parti).
 */
export async function liveBoard(db: PrismaClient, organizationId: string, date?: DateStr, opts: { employeeIds?: string[] } = {}): Promise<{ date: DateStr; rows: LiveRow[] }> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const tz = org.timezone;
  const today = todayIn(tz);
  const day = date ?? today;
  const isToday = day === today;
  const nowLocal = toLocal(new Date(), tz);
  const startUtc = fromLocal((Date.parse(`${addDays(day, -1)}T00:00:00Z`) / 60000) | 0, tz);
  const endUtc = fromLocal((Date.parse(`${addDays(day, 2)}T00:00:00Z`) / 60000) | 0, tz);

  const empWhere = { organizationId, status: "ACTIVE" as const, ...(opts.employeeIds ? { id: { in: opts.employeeIds } } : {}) };
  const [employees, shiftTypes, assignments, punches, rules, leaves, leads] = await Promise.all([
    db.employee.findMany({ where: empWhere, include: { service: { select: { name: true } } }, orderBy: [{ lastName: "asc" }] }),
    db.shiftType.findMany({ where: { organizationId } }),
    db.shiftAssignment.findMany({ where: { organizationId, status: "PUBLISHED", leaveRequestId: null, date: { gte: dbDate(addDays(day, -1)), lte: dbDate(day) } } }),
    db.punch.findMany({ where: { organizationId, deletedAt: null, employeeId: { not: null }, timestamp: { gte: startUtc, lt: endUtc } }, orderBy: { timestamp: "asc" } }),
    db.workRule.findMany({ where: { organizationId } }),
    db.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", startDate: { lte: dbDate(day) }, endDate: { gte: dbDate(day) } } }),
    db.membership.findMany({ where: { organizationId, role: "CHEF", active: true }, select: { employeeId: true } }),
  ]);
  const stMap = new Map(shiftTypes.map((s) => [s.id, toShiftTypeDef(s)]));
  const wr = rules.map(toWorkRuleDef);
  const night = { start: org.nightStart, end: org.nightEnd };
  const leadIds = new Set(leads.map((l) => l.employeeId));
  const punchesBy = new Map<string, number[]>();
  for (const p of punches) punchesBy.set(p.employeeId!, [...(punchesBy.get(p.employeeId!) ?? []), toLocal(p.timestamp, tz)]);

  const rows: LiveRow[] = employees.map((e) => {
    const shifts = assignments
      .filter((a) => a.employeeId === e.id)
      .map((a) => resolveAssignment({ id: a.id, employeeId: e.id, date: fromDbDate(a.date), shiftTypeId: a.shiftTypeId, customStart: a.customStart, customEnd: a.customEnd, breakMinutes: a.breakMinutes }, stMap, night))
      .filter((s): s is ResolvedShift => !!s);
    const pairs = pairPunches(punchesBy.get(e.id) ?? []);
    const byDate = assignPairsToDates(pairs, shifts);
    const dayPairs = byDate.get(day) ?? [];
    const dayShifts = shifts.filter((s) => s.date === day);
    const tolerance = resolveRule(wr, "LATE_TOLERANCE_MINUTES", e.staffCategoryId)?.value ?? 0;
    const onLeave = leaves.some((l) => l.employeeId === e.id);
    const res = computeDayAttendance({ date: day, shifts: dayShifts, pairs: dayPairs, nightWindow: night, lateToleranceMinutes: tolerance, onLeave, now: isToday ? nowLocal : undefined });
    const open = dayPairs.find((p) => p.out === null);
    const all = dayPairs.flatMap((p) => [p.in, p.out]).filter((x): x is number => x !== null);
    const last = all.length ? Math.max(...all) : null;
    let status: LiveStatus = res.status;
    if (isToday && open) status = res.lateMinutes ? "LATE" : "PRESENT";
    const iso = (t: number | null) => (t === null ? null : fromLocal(t, tz).toISOString());
    return {
      employeeId: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      position: e.position,
      isLead: leadIds.has(e.id),
      serviceName: e.service?.name ?? null,
      status,
      planned: dayShifts.map((s) => {
        const st = s.shiftTypeId ? stMap.get(s.shiftTypeId) : undefined;
        const hhmm = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
        return { code: s.code, name: s.name, start: hhmm(s.interval.start), end: hhmm(s.interval.end), color: st?.color ?? "#66736F" };
      }),
      firstIn: iso(res.firstIn),
      lastPunch: iso(last),
      openSince: iso(open?.in ?? null),
      workedMinutes: Math.round(res.workedMinutes),
      lateMinutes: res.lateMinutes,
    };
  });
  return { date: day, rows };
}
