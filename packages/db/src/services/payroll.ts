import {
  computePayslip,
  type DateStr,
  DEFAULT_FISCAL_RULES_MA,
  eachDay,
  EMPTY_HOURS,
  type FiscalRules,
  grossHourlyFromNet,
  type PayrollHours,
  UNPAID_LEAVE_TYPES,
  weekday,
  isCountedDay,
} from "@yghr/core";
import type { PrismaClient } from "../generated/prisma/client";
import { dbDate, fromDbDate } from "../tz";

export function periodRange(year: number, month: number): { from: DateStr; to: DateStr } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

/** Pick the fiscal version valid at the start of the period. */
export async function fiscalVersionFor(db: PrismaClient, year: number, month: number) {
  const { from } = periodRange(year, month);
  const v = await db.fiscalRuleVersion.findFirst({
    where: { country: "MA", validFrom: { lte: dbDate(from) }, OR: [{ validTo: null }, { validTo: { gte: dbDate(from) } }] },
    orderBy: { validFrom: "desc" },
  });
  if (v) return v;
  return db.fiscalRuleVersion.create({ data: { country: "MA", label: "Valeurs par défaut", validFrom: dbDate("2025-01-01"), data: DEFAULT_FISCAL_RULES_MA as object } });
}

export interface CalcSummary {
  count: number;
  warnings: number;
  unvalidatedDays: number;
}

/**
 * Calculate (or recalculate) every payslip of a DRAFT/CALCULATED period.
 * Hours come from AttendanceDay rows; validated days are preferred and unvalidated days raise a warning.
 */
export async function calculatePeriod(db: PrismaClient, periodId: string): Promise<CalcSummary> {
  const period = await db.payrollPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { fiscalRuleVersion: true, organization: true } });
  if (period.status === "LOCKED" || period.status === "VALIDATED") throw new Error("Période validée ou verrouillée : recalcul impossible.");
  const rules = period.fiscalRuleVersion.data as unknown as FiscalRules;
  const org = period.organization;
  const { from, to } = periodRange(period.year, period.month);
  const holidays = (await db.publicHoliday.findMany({ where: { OR: [{ organizationId: null }, { organizationId: org.id }], date: { gte: dbDate(from), lte: dbDate(to) } } })).map((h) => fromDbDate(h.date));

  const employees = await db.employee.findMany({
    where: { organizationId: org.id, status: "ACTIVE", OR: [{ hireDate: null }, { hireDate: { lte: dbDate(to) } }] },
    include: {
      attendanceDays: { where: { date: { gte: dbDate(from), lte: dbDate(to) } } },
      payElements: { where: { OR: [{ periodId }, { periodId: null, createdAt: { lte: new Date(`${to}T23:59:59Z`) } }] } },
      leaveRequests: { where: { status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(from) } } },
    },
  });

  // Approved advances not yet attached to a period become ADVANCE elements.
  const advances = await db.advanceRequest.findMany({ where: { organizationId: org.id, status: "APPROVED", createdAt: { lte: new Date(`${to}T23:59:59Z`) } } });
  for (const adv of advances) {
    const exists = await db.payElement.findFirst({ where: { sourceId: adv.id } });
    if (!exists) await db.payElement.create({ data: { organizationId: org.id, employeeId: adv.employeeId, periodId, kind: "ADVANCE", label: "Acompte sur salaire", amount: adv.amount, taxable: false, cnssSubject: false, sourceId: adv.id } });
  }
  const expenses = await db.expenseReport.findMany({ where: { organizationId: org.id, status: "APPROVED", reimbursement: "PAYROLL", date: { lte: dbDate(to) } } });
  for (const ex of expenses) {
    const exists = await db.payElement.findFirst({ where: { sourceId: ex.id } });
    if (!exists) await db.payElement.create({ data: { organizationId: org.id, employeeId: ex.employeeId, periodId, kind: "EXPENSE", label: `Note de frais : ${ex.category}`, amount: ex.amount, taxable: false, cnssSubject: false, sourceId: ex.id } });
  }

  let warningsCount = 0;
  let unvalidatedDays = 0;
  for (const e of employees) {
    const elements = await db.payElement.findMany({ where: { employeeId: e.id, OR: [{ periodId }, { periodId: null }] } });
    const hours: PayrollHours = { ...EMPTY_HOURS };
    for (const d of e.attendanceDays) {
      if (!d.validatedAt && d.workedMinutes > 0) unvalidatedDays++;
      const date = fromDbDate(d.date);
      const restDay = org.weeklyRestDay !== null && weekday(date) === org.weeklyRestDay;
      const otNight = d.workedMinutes > 0 ? Math.round((d.overtimeMinutes * d.nightMinutes) / d.workedMinutes) : 0;
      if (restDay) {
        hours.restDayDayMinutes += d.workedMinutes - d.nightMinutes;
        hours.restDayNightMinutes += d.nightMinutes;
      } else {
        hours.normalMinutes += d.workedMinutes - d.overtimeMinutes;
        hours.nightMinutes += d.nightMinutes;
        hours.overtimeNightMinutes += otNight;
        hours.overtimeDayMinutes += d.overtimeMinutes - otNight;
      }
    }
    // Unpaid leave → deduction on monthly base (per counted day × daily contract hours).
    const weekly = e.weeklyHours?.toNumber() ?? 44;
    const dailyMinutes = (weekly / 6) * 60;
    for (const l of e.leaveRequests) {
      if (!UNPAID_LEAVE_TYPES.includes(l.type)) continue;
      for (const day of eachDay(fromDbDate(l.startDate), fromDbDate(l.endDate))) {
        if (day < from || day > to) continue;
        if (isCountedDay(day, "OUVRABLES", new Set(holidays))) hours.unpaidAbsenceMinutes += dailyMinutes;
      }
    }
    for (const d of e.attendanceDays) if (d.status === "ABSENT" && d.justified === false) hours.unpaidAbsenceMinutes += d.plannedMinutes;

    let hourlyRate = e.hourlyRate?.toNumber() ?? null;
    if (!hourlyRate && !e.monthlyBase && e.netHourlyRate) hourlyRate = grossHourlyFromNet(e.netHourlyRate.toNumber(), weekly, e.familyDependents, rules);
    const result = computePayslip(
      {
        monthlyBase: e.monthlyBase?.toNumber() ?? null,
        hourlyRate,
        weeklyHours: weekly,
        familyDependents: e.familyDependents,
        hours,
        elements: elements.map((x) => ({ kind: x.kind, label: x.label, amount: x.amount.toNumber(), taxable: x.taxable, cnssSubject: x.cnssSubject })),
      },
      rules,
    );
    const warnings = [...result.warnings];
    const notValidated = e.attendanceDays.filter((d) => !d.validatedAt && d.workedMinutes > 0).length;
    if (notValidated) warnings.push(`${notValidated} jour(s) de présence non validé(s).`);
    if (!e.monthlyBase && !hourlyRate) warnings.push("Taux de rémunération manquant.");
    warningsCount += warnings.length;
    const data = {
      hours: hours as object,
      lines: result.lines as object,
      gross: result.gross,
      cnssEmployee: result.cnssEmployee,
      amoEmployee: result.amoEmployee,
      ipeEmployee: result.ipeEmployee,
      profExpenses: result.profExpenses,
      taxableNet: result.taxableNet,
      irGross: result.irGross,
      familyDeduction: result.familyDeduction,
      ir: result.ir,
      net: result.net,
      employerCharges: result.employerCharges as object,
      warnings,
    };
    await db.payslip.upsert({ where: { periodId_employeeId: { periodId, employeeId: e.id } }, create: { periodId, employeeId: e.id, ...data }, update: data });
  }
  await db.payrollPeriod.update({ where: { id: periodId }, data: { status: "CALCULATED", calculatedAt: new Date() } });
  return { count: employees.length, warnings: warningsCount, unvalidatedDays };
}
