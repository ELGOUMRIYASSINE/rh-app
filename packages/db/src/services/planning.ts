import {
  analysisContextRange,
  analyzePlanning,
  type Anomaly,
  type DateStr,
  type ShiftTypeDef,
  type WorkRuleDef,
  type WorkRuleType,
  type CoverageRuleDef,
  LEAVE_TYPE_LABELS,
} from "@yghr/core";
import type { PrismaClient } from "../generated/prisma/client";
import { dbDate, fromDbDate } from "../tz";

export function toShiftTypeDef(s: {
  id: string; name: string; code: string; startTime: string; endTime: string; breakMinutes: number; breakPaid: boolean; isNight: boolean; staffCategoryId: string | null; color: string;
}): ShiftTypeDef {
  return { ...s };
}

export function toWorkRuleDef(r: {
  id: string; type: string; staffCategoryId: string | null; value: { toNumber(): number } | null; boolValue: boolean | null; severity: "BLOCKING" | "WARNING"; exceptionAllowed: boolean; active: boolean;
}): WorkRuleDef {
  return {
    id: r.id,
    type: r.type as WorkRuleType,
    staffCategoryId: r.staffCategoryId,
    value: r.value === null ? null : r.value.toNumber(),
    boolValue: r.boolValue,
    severity: r.severity,
    exceptionAllowed: r.exceptionAllowed,
    active: r.active,
  };
}

/** Load everything the anomaly engine needs and run it. `employeeIds` restricts the scope (team leads). */
export async function analyzeOrgPlanning(
  db: PrismaClient,
  organizationId: string,
  from: DateStr,
  to: DateStr,
  opts: { employeeIds?: string[] } = {},
): Promise<Anomaly[]> {
  const ctx = analysisContextRange(from, to);
  const empWhere = { organizationId, status: "ACTIVE" as const, ...(opts.employeeIds ? { id: { in: opts.employeeIds } } : {}) };
  const [org, employees, shiftTypes, assignments, rules, coverage, leaves, unav, exceptions, cats, services] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.employee.findMany({ where: empWhere, select: { id: true, firstName: true, lastName: true, staffCategoryId: true, serviceId: true, weeklyHours: true } }),
    db.shiftType.findMany({ where: { organizationId } }),
    db.shiftAssignment.findMany({ where: { organizationId, date: { gte: dbDate(ctx.from), lte: dbDate(ctx.to) }, leaveRequestId: null } }),
    db.workRule.findMany({ where: { organizationId } }),
    opts.employeeIds ? Promise.resolve([]) : db.coverageRule.findMany({ where: { organizationId } }),
    db.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", startDate: { lte: dbDate(ctx.to) }, endDate: { gte: dbDate(ctx.from) } } }),
    db.availability.findMany({ where: { organizationId, available: false, date: { gte: dbDate(from), lte: dbDate(to) } } }),
    db.planningException.findMany({ where: { organizationId, date: { gte: dbDate(from), lte: dbDate(to) } } }),
    db.staffCategory.findMany({ where: { organizationId } }),
    db.service.findMany({ where: { organizationId } }),
  ]);
  return analyzePlanning({
    from,
    to,
    employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, staffCategoryId: e.staffCategoryId, serviceId: e.serviceId, weeklyHours: e.weeklyHours?.toNumber() ?? null })),
    shiftTypes: shiftTypes.map(toShiftTypeDef),
    assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, date: fromDbDate(a.date), shiftTypeId: a.shiftTypeId, customStart: a.customStart, customEnd: a.customEnd, breakMinutes: a.breakMinutes })),
    rules: rules.map(toWorkRuleDef),
    coverageRules: (coverage as Awaited<ReturnType<typeof db.coverageRule.findMany>>).map(
      (c): CoverageRuleDef => ({ id: c.id, shiftTypeId: c.shiftTypeId, serviceId: c.serviceId, staffCategoryId: c.staffCategoryId, min: c.min, max: c.max, days: c.days, severity: c.severity, active: c.active, label: c.label }),
    ),
    leaves: leaves.map((l) => ({ employeeId: l.employeeId, startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate), label: LEAVE_TYPE_LABELS[l.type] })),
    unavailabilities: unav.map((u) => ({ employeeId: u.employeeId, startDate: fromDbDate(u.date), endDate: fromDbDate(u.date) })),
    exceptions: exceptions.map((x) => ({ id: x.id, anomalyKey: x.anomalyKey })),
    nightWindow: { start: org.nightStart, end: org.nightEnd },
    categoryNames: Object.fromEntries(cats.map((c) => [c.id, c.name])),
    serviceNames: Object.fromEntries(services.map((s) => [s.id, s.name])),
  });
}
