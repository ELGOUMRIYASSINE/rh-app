import "server-only";
import { BALANCE_LEAVE_TYPES, computeBalance, countLeaveDays, currentPeriodStart, type LeavePolicyDef, type LeaveType, addDays } from "@yghr/core";
import { prisma, dbDate, fromDbDate, todayIn } from "@yghr/db";

export async function policies(organizationId: string): Promise<LeavePolicyDef[]> {
  const rows = await prisma.leavePolicy.findMany({ where: { organizationId } });
  return rows.map((p) => ({ leaveType: p.leaveType, enabled: p.enabled, countingMethod: p.countingMethod, accruedPerMonth: p.accruedPerMonth?.toNumber() ?? null, annualAllowance: p.annualAllowance?.toNumber() ?? null, annualCap: p.annualCap?.toNumber() ?? null, periodStart: p.periodStart, allowAdvanceFirstYear: p.allowAdvanceFirstYear }));
}

export async function holidayDates(organizationId: string, from: string, to: string): Promise<string[]> {
  const rows = await prisma.publicHoliday.findMany({ where: { OR: [{ organizationId: null }, { organizationId }], date: { gte: dbDate(from), lte: dbDate(to) } } });
  return rows.map((h) => fromDbDate(h.date));
}

/** Leave types whose yearly allowance each employee must declare at the start of the period. */
export const DECLARED_LEAVE_TYPES: LeaveType[] = ["PAID_LEAVE"];

export interface BalanceRow {
  type: LeaveType;
  method: string;
  acquired: number;
  taken: number;
  pending: number;
  adjusted: number;
  available: number;
  periodStart: string;
  periodYear: number;
  /** Declared annual allowance for the period, null when not declared yet. */
  entitlement: number | null;
  /** True when the employee must declare their annual allowance before requesting this type. */
  needsDeclaration: boolean;
}

/** acquis · pris · solde for each enabled balance type. */
export async function balancesFor(organizationId: string, employeeId: string, asOf?: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const today = asOf ?? todayIn(org.timezone);
  const emp = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, organizationId } });
  const pols = (await policies(organizationId)).filter((p) => p.enabled && BALANCE_LEAVE_TYPES.includes(p.leaveType));
  const out: BalanceRow[] = [];
  for (const p of pols) {
    const ps = currentPeriodStart(p.periodStart, today);
    const pe = addDays(`${Number(ps.slice(0, 4)) + 1}${ps.slice(4)}`, -1);
    const reqs = await prisma.leaveRequest.findMany({ where: { employeeId, type: p.leaveType, status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: dbDate(pe) }, endDate: { gte: dbDate(ps) } } });
    const taken = reqs.filter((r) => r.status === "APPROVED").reduce((t, r) => t + r.days.toNumber(), 0);
    const pending = reqs.filter((r) => r.status === "PENDING").reduce((t, r) => t + r.days.toNumber(), 0);
    const adj = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveType_periodYear: { employeeId, leaveType: p.leaveType, periodYear: Number(ps.slice(0, 4)) } } });
    const b = computeBalance({ policy: p, hireDate: emp.hireDate ? fromDbDate(emp.hireDate) : null, asOf: today, taken, adjusted: adj?.adjusted.toNumber() ?? 0 });
    const entitlement = adj?.entitlement?.toNumber() ?? null;
    // DECISION: a declared annual allowance (18, 21, 30 j…) replaces the policy accrual for that period.
    const acquired = entitlement ?? b.acquired;
    const available = Math.round((acquired + b.adjusted - taken) * 100) / 100;
    out.push({ type: p.leaveType, method: p.countingMethod, acquired, taken, pending, adjusted: b.adjusted, available, periodStart: b.periodStart, periodYear: Number(ps.slice(0, 4)), entitlement, needsDeclaration: DECLARED_LEAVE_TYPES.includes(p.leaveType) && entitlement === null });
  }
  return out;
}

export async function leaveDays(organizationId: string, type: LeaveType, startDate: string, endDate: string, halfDayStart = false, halfDayEnd = false) {
  const pol = (await policies(organizationId)).find((p) => p.leaveType === type);
  const method = pol?.countingMethod ?? "OUVRABLES";
  const holidays = await holidayDates(organizationId, startDate, endDate);
  return { days: countLeaveDays({ startDate, endDate, method, holidays, halfDayStart, halfDayEnd }), method };
}

/** Paid-leave allowance overview for a set of employees (RH screen). Null when paid leave is disabled. */
export async function entitlementsOverview(organizationId: string, employeeIds: string[] | null) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const today = todayIn(org.timezone);
  const pol = (await policies(organizationId)).find((p) => p.leaveType === "PAID_LEAVE" && p.enabled);
  if (!pol) return null;
  const ps = currentPeriodStart(pol.periodStart, today);
  const pe = addDays(`${Number(ps.slice(0, 4)) + 1}${ps.slice(4)}`, -1);
  const periodYear = Number(ps.slice(0, 4));
  const emps = await prisma.employee.findMany({ where: { organizationId, status: "ACTIVE", ...(employeeIds ? { id: { in: employeeIds } } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, position: true } });
  const ids = emps.map((e) => e.id);
  const [rows, reqs] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { employeeId: { in: ids }, leaveType: "PAID_LEAVE", periodYear } }),
    prisma.leaveRequest.groupBy({ by: ["employeeId", "status"], where: { employeeId: { in: ids }, type: "PAID_LEAVE", status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: dbDate(pe) }, endDate: { gte: dbDate(ps) } }, _sum: { days: true } }),
  ]);
  const sum = (id: string, st: string) => reqs.find((r) => r.employeeId === id && r.status === st)?._sum.days?.toNumber() ?? 0;
  return {
    periodYear,
    periodStart: ps,
    periodEnd: pe,
    items: emps.map((e) => {
      const b = rows.find((r) => r.employeeId === e.id);
      const entitlement = b?.entitlement?.toNumber() ?? null;
      const adjusted = b?.adjusted.toNumber() ?? 0;
      const taken = sum(e.id, "APPROVED");
      const pending = sum(e.id, "PENDING");
      return { employee: e, entitlement, adjusted, taken, pending, available: entitlement === null ? null : Math.round((entitlement + adjusted - taken) * 100) / 100, declaredAt: b?.declaredAt?.toISOString() ?? null };
    }),
  };
}
