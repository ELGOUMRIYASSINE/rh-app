import "server-only";
import { addDays, eachDay } from "@yghr/core";
import { prisma, dbDate, fromDbDate, fromLocal, recomputeAttendance, todayIn } from "@yghr/db";

const dayStartUtc = (d: string, tz: string) => fromLocal((Date.parse(`${d}T00:00:00Z`) / 60000) | 0, tz);

/** Summary per day of a week: planned, validated, absent. */
export async function weekSummary(organizationId: string, from: string, scope: string[] | null) {
  const to = addDays(from, 6);
  const empF = scope ? { employeeId: { in: scope } } : {};
  const [planned, days] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { organizationId, status: "PUBLISHED", leaveRequestId: null, date: { gte: dbDate(from), lte: dbDate(to) }, ...empF }, select: { employeeId: true, date: true } }),
    prisma.attendanceDay.findMany({ where: { organizationId, date: { gte: dbDate(from), lte: dbDate(to) }, ...empF }, select: { employeeId: true, date: true, status: true, validatedAt: true } }),
  ]);
  return eachDay(from, to).map((d) => {
    const p = new Set(planned.filter((x) => fromDbDate(x.date) === d).map((x) => x.employeeId));
    const ds = days.filter((x) => fromDbDate(x.date) === d);
    const relevant = new Set([...p, ...ds.filter((x) => x.status !== "OFF").map((x) => x.employeeId)]);
    const validated = ds.filter((x) => x.validatedAt && relevant.has(x.employeeId)).length;
    return { date: d, planned: p.size, total: relevant.size, validated, absent: ds.filter((x) => x.status === "ABSENT").length };
  });
}

/** Detail of a day for correction & validation. */
export async function dayDetail(organizationId: string, date: string, scope: string[] | null) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const tz = org.timezone;
  const empF = scope ? { employeeId: { in: scope } } : {};
  const assignments = await prisma.shiftAssignment.findMany({ where: { organizationId, status: "PUBLISHED", leaveRequestId: null, date: dbDate(date), ...empF }, include: { shiftType: true } });
  const punches = await prisma.punch.findMany({ where: { organizationId, employeeId: { not: null }, timestamp: { gte: dayStartUtc(addDays(date, 0), tz), lt: dayStartUtc(addDays(date, 2), tz) }, ...(scope ? { employeeId: { in: scope } } : {}) }, orderBy: { timestamp: "asc" } });
  const empIds = [...new Set([...assignments.map((a) => a.employeeId), ...punches.filter((p) => p.timestamp < dayStartUtc(addDays(date, 1), tz)).map((p) => p.employeeId!)])];
  if (date <= todayIn(tz)) for (const id of empIds) await recomputeAttendance(prisma, organizationId, id, date, date);
  const [employees, days] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: empIds }, organizationId }, select: { id: true, firstName: true, lastName: true, position: true }, orderBy: { lastName: "asc" } }),
    prisma.attendanceDay.findMany({ where: { organizationId, date: dbDate(date), employeeId: { in: empIds } } }),
  ]);
  return {
    date,
    rows: employees.map((e) => {
      const a = assignments.filter((x) => x.employeeId === e.id);
      const d = days.find((x) => x.employeeId === e.id);
      // punches belonging to this work day: from 00:00 to the end of the planned shift (+4 h) or 24:00
      const lastEnd = a.length ? Math.max(...a.map((x) => { const st = x.customStart ?? x.shiftType?.startTime ?? "00:00"; const en = x.customEnd ?? x.shiftType?.endTime ?? "23:59"; return en <= st ? 1 : 0; })) : 0;
      const until = lastEnd ? dayStartUtc(addDays(date, 1), tz).getTime() + 14 * 3600_000 : dayStartUtc(addDays(date, 1), tz).getTime();
      return {
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        position: e.position,
        planned: a.map((x) => ({ code: x.shiftType?.code ?? "PERSO", name: x.shiftType?.name ?? "Horaire personnalisé", color: x.shiftType?.color ?? "#66736F", start: x.customStart ?? x.shiftType?.startTime ?? "", end: x.customEnd ?? x.shiftType?.endTime ?? "" })),
        punches: punches.filter((p) => p.employeeId === e.id && p.timestamp.getTime() < until).map((p) => ({ id: p.id, at: p.timestamp.toISOString(), source: p.source, deleted: !!p.deletedAt, reason: p.reason })),
        day: d ? { status: d.status, worked: d.workedMinutes, night: d.nightMinutes, overtime: d.overtimeMinutes, late: d.lateMinutes, early: d.earlyLeaveMinutes, issues: d.issues, justified: d.justified, validated: !!d.validatedAt } : null,
      };
    }),
  };
}
