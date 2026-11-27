import {
  addDays,
  assignPairsToDates,
  computeDayAttendance,
  type DateStr,
  eachDay,
  pairPunches,
  resolveAssignment,
  resolveRule,
  type ResolvedShift,
  startOfIsoWeek,
  weeklyOvertimeMinutes,
} from "@yghr/core";
import type { PrismaClient } from "../generated/prisma/client";
import { dbDate, fromDbDate, fromLocal, toLocal, todayIn } from "../tz";
import { toShiftTypeDef, toWorkRuleDef } from "./planning";

/**
 * Recompute AttendanceDay rows for one employee over [from, to].
 * Triggered by a new punch, a correction, a mapping, a planning change or a rule change.
 * Validated days are left untouched.
 */
export async function recomputeAttendance(db: PrismaClient, organizationId: string, employeeId: string, from: DateStr, to: DateStr): Promise<number> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const tz = org.timezone;
  const emp = await db.employee.findFirst({ where: { id: employeeId, organizationId } });
  if (!emp) return 0;
  const ctxFrom = addDays(from, -1);
  const ctxTo = addDays(to, 1);
  const [shiftTypes, assignments, punches, rules, leaves] = await Promise.all([
    db.shiftType.findMany({ where: { organizationId } }),
    db.shiftAssignment.findMany({ where: { organizationId, employeeId, status: "PUBLISHED", leaveRequestId: null, date: { gte: dbDate(ctxFrom), lte: dbDate(ctxTo) } } }),
    db.punch.findMany({
      where: { organizationId, employeeId, deletedAt: null, timestamp: { gte: fromLocal(toLocalStart(ctxFrom), tz), lt: fromLocal(toLocalStart(addDays(ctxTo, 1)), tz) } },
      orderBy: { timestamp: "asc" },
    }),
    db.workRule.findMany({ where: { organizationId } }),
    db.leaveRequest.findMany({ where: { organizationId, employeeId, status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(from) } } }),
  ]);
  const stMap = new Map(shiftTypes.map((s) => [s.id, toShiftTypeDef(s)]));
  const night = { start: org.nightStart, end: org.nightEnd };
  const shifts = assignments
    .map((a) => resolveAssignment({ id: a.id, employeeId, date: fromDbDate(a.date), shiftTypeId: a.shiftTypeId, customStart: a.customStart, customEnd: a.customEnd, breakMinutes: a.breakMinutes }, stMap, night))
    .filter((s): s is ResolvedShift => !!s);
  const wr = rules.map(toWorkRuleDef);
  const tolerance = resolveRule(wr, "LATE_TOLERANCE_MINUTES", emp.staffCategoryId)?.value ?? 0;
  const earlyTol = resolveRule(wr, "EARLY_LEAVE_TOLERANCE_MINUTES", emp.staffCategoryId)?.value ?? 0;
  const pairs = pairPunches(punches.map((p) => toLocal(p.timestamp, tz)));
  const byDate = assignPairsToDates(pairs, shifts);
  const today = todayIn(tz);
  const nowLocal = toLocal(new Date(), tz);

  let count = 0;
  for (const date of eachDay(from, to)) {
    const existing = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date: dbDate(date) } } });
    if (existing?.validatedAt) continue;
    const dayShifts = shifts.filter((s) => s.date === date);
    const onLeave = leaves.some((l) => fromDbDate(l.startDate) <= date && fromDbDate(l.endDate) >= date);
    const res = computeDayAttendance({
      date,
      shifts: dayShifts,
      pairs: byDate.get(date) ?? [],
      nightWindow: night,
      lateToleranceMinutes: tolerance,
      earlyLeaveToleranceMinutes: earlyTol,
      onLeave,
      now: date >= addDays(today, -1) ? nowLocal : undefined,
    });
    if (res.status === "OFF" && !existing && !dayShifts.length) continue;
    const data = {
      organizationId,
      employeeId,
      date: dbDate(date),
      firstIn: res.firstIn !== null ? fromLocal(res.firstIn, tz) : null,
      lastOut: res.lastOut !== null ? fromLocal(res.lastOut, tz) : null,
      plannedMinutes: res.plannedMinutes,
      workedMinutes: Math.round(res.workedMinutes),
      normalMinutes: Math.round(res.normalMinutes),
      nightMinutes: Math.round(res.nightMinutes),
      lateMinutes: Math.round(res.lateMinutes),
      earlyLeaveMinutes: Math.round(res.earlyLeaveMinutes),
      status: res.status,
      issues: res.issues,
    };
    await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId, date: dbDate(date) } }, create: data, update: data });
    count++;
  }

  // Weekly overtime, written on the last worked day of each ISO week touched.
  const otThreshold = resolveRule(wr, "OVERTIME_WEEKLY_THRESHOLD_HOURS", emp.staffCategoryId)?.value ?? 44;
  const weeks = new Set(eachDay(from, to).map((d) => startOfIsoWeek(d)));
  for (const monday of weeks) {
    const days = await db.attendanceDay.findMany({ where: { employeeId, date: { gte: dbDate(monday), lte: dbDate(addDays(monday, 6)) } }, orderBy: { date: "asc" } });
    const worked = days.reduce((t, d) => t + d.workedMinutes, 0);
    const ot = weeklyOvertimeMinutes(worked, otThreshold, emp.weeklyHours?.toNumber() ?? null);
    const lastWorked = [...days].reverse().find((d) => d.workedMinutes > 0);
    for (const d of days) {
      const value = d.id === lastWorked?.id ? ot : 0;
      if (d.overtimeMinutes !== value && !d.validatedAt) await db.attendanceDay.update({ where: { id: d.id }, data: { overtimeMinutes: value } });
    }
  }
  return count;
}

function toLocalStart(date: DateStr): number {
  return (Date.parse(`${date}T00:00:00Z`) / 60_000) | 0;
}

/** Recompute for every active employee (rule change). */
export async function recomputeOrgAttendance(db: PrismaClient, organizationId: string, from: DateStr, to: DateStr): Promise<number> {
  const emps = await db.employee.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true } });
  let n = 0;
  for (const e of emps) n += await recomputeAttendance(db, organizationId, e.id, from, to);
  return n;
}
