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

/** acquis · pris · solde for each enabled balance type. */
export async function balancesFor(organizationId: string, employeeId: string, asOf?: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const today = asOf ?? todayIn(org.timezone);
  const emp = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, organizationId } });
  const pols = (await policies(organizationId)).filter((p) => p.enabled && BALANCE_LEAVE_TYPES.includes(p.leaveType));
  const out: { type: LeaveType; method: string; acquired: number; taken: number; pending: number; adjusted: number; available: number; periodStart: string }[] = [];
  for (const p of pols) {
    const ps = currentPeriodStart(p.periodStart, today);
    const pe = addDays(`${Number(ps.slice(0, 4)) + 1}${ps.slice(4)}`, -1);
    const reqs = await prisma.leaveRequest.findMany({ where: { employeeId, type: p.leaveType, status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: dbDate(pe) }, endDate: { gte: dbDate(ps) } } });
    const taken = reqs.filter((r) => r.status === "APPROVED").reduce((t, r) => t + r.days.toNumber(), 0);
    const pending = reqs.filter((r) => r.status === "PENDING").reduce((t, r) => t + r.days.toNumber(), 0);
    const adj = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveType_periodYear: { employeeId, leaveType: p.leaveType, periodYear: Number(ps.slice(0, 4)) } } });
    const b = computeBalance({ policy: p, hireDate: emp.hireDate ? fromDbDate(emp.hireDate) : null, asOf: today, taken, adjusted: adj?.adjusted.toNumber() ?? 0 });
    out.push({ type: p.leaveType, method: p.countingMethod, acquired: b.acquired, taken, pending, adjusted: b.adjusted, available: b.available, periodStart: b.periodStart });
  }
  return out;
}

export async function leaveDays(organizationId: string, type: LeaveType, startDate: string, endDate: string, halfDayStart = false, halfDayEnd = false) {
  const pol = (await policies(organizationId)).find((p) => p.leaveType === type);
  const method = pol?.countingMethod ?? "OUVRABLES";
  const holidays = await holidayDates(organizationId, startDate, endDate);
  return { days: countLeaveDays({ startDate, endDate, method, holidays, halfDayStart, halfDayEnd }), method };
}
