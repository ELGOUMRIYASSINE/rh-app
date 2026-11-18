import "server-only";
import { DEFAULT_FISCAL_RULES_MA, eachDay, grossHourlyFromNet, LEAVE_TYPE_LABELS } from "@yghr/core";
import { prisma, dbDate, fromDbDate } from "@yghr/db";

/** Days that can no longer be edited: validated attendance or a locked/validated payroll month. */
export async function lockedDays(organizationId: string, from: string, to: string, employeeIds?: string[]) {
  const months = new Set(eachDay(from, to).map((d) => d.slice(0, 7)));
  const periods = await prisma.payrollPeriod.findMany({ where: { organizationId, status: { in: ["VALIDATED", "LOCKED"] } } });
  const lockedMonths = new Set(periods.map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`).filter((m) => months.has(m)));
  const validated = await prisma.attendanceDay.findMany({ where: { organizationId, validatedAt: { not: null }, date: { gte: dbDate(from), lte: dbDate(to) }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) }, select: { employeeId: true, date: true } });
  return { lockedMonths: [...lockedMonths], validated: validated.map((v) => `${v.employeeId}:${fromDbDate(v.date)}`) };
}

export async function planningData(organizationId: string, from: string, to: string, opts: { employeeIds?: string[] | null; publishedOnly?: boolean } = {}) {
  const empWhere = { organizationId, status: "ACTIVE" as const, ...(opts.employeeIds ? { id: { in: opts.employeeIds } } : {}) };
  const [org, employees, shiftTypes, assignments, leaves, unav, leads, locks, categories, services] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.employee.findMany({ where: empWhere, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: { staffCategory: { select: { name: true } }, service: { select: { name: true } } } }),
    prisma.shiftType.findMany({ where: { organizationId }, orderBy: { startTime: "asc" } }),
    prisma.shiftAssignment.findMany({ where: { organizationId, date: { gte: dbDate(from), lte: dbDate(to) }, ...(opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {}), ...(opts.publishedOnly ? { status: "PUBLISHED" } : {}) } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(from) }, ...(opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {}) } }),
    prisma.availability.findMany({ where: { organizationId, available: false, date: { gte: dbDate(from), lte: dbDate(to) } } }),
    prisma.membership.findMany({ where: { organizationId, role: "CHEF" }, select: { employeeId: true } }),
    lockedDays(organizationId, from, to, opts.employeeIds ?? undefined),
    prisma.staffCategory.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const leadIds = new Set(leads.map((l) => l.employeeId));
  return {
    from,
    to,
    nightStart: org.nightStart,
    nightEnd: org.nightEnd,
    employees: employees.map((e) => {
      const weekly = e.weeklyHours?.toNumber() ?? 44;
      const rate = e.hourlyRate?.toNumber() ?? (e.monthlyBase ? e.monthlyBase.toNumber() / ((191 * weekly) / 44) : e.netHourlyRate ? grossHourlyFromNet(e.netHourlyRate.toNumber(), weekly, e.familyDependents) : 0);
      return { id: e.id, firstName: e.firstName, lastName: e.lastName, category: e.staffCategory?.name ?? null, staffCategoryId: e.staffCategoryId, service: e.service?.name ?? null, serviceId: e.serviceId, weeklyHours: weekly, rate: Math.round(rate * 100) / 100, isLead: leadIds.has(e.id) };
    }),
    shiftTypes: shiftTypes.map((s) => ({ id: s.id, name: s.name, code: s.code, color: s.color, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, breakPaid: s.breakPaid, isNight: s.isNight, staffCategoryId: s.staffCategoryId, active: s.active })),
    assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, date: fromDbDate(a.date), shiftTypeId: a.shiftTypeId, customStart: a.customStart, customEnd: a.customEnd, breakMinutes: a.breakMinutes, note: a.note, status: a.status, leaveRequestId: a.leaveRequestId })),
    leaves: leaves.map((l) => ({ employeeId: l.employeeId, startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate), type: l.type, label: LEAVE_TYPE_LABELS[l.type] })),
    unavailable: unav.map((u) => `${u.employeeId}:${fromDbDate(u.date)}`),
    locks,
    categories,
    services,
    overtimeRate: DEFAULT_FISCAL_RULES_MA.overtime.day,
  };
}
export type PlanningData = Awaited<ReturnType<typeof planningData>>;
