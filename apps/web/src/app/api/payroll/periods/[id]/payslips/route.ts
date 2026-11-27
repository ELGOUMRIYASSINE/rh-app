import { prisma, dbDate } from "@yghr/db";
import { fail, route } from "@/server/api";
import { periodRange } from "@yghr/db";

export const GET = route({ feature: "payroll", permission: "payroll.validate" }, async ({ s, params }) => {
  const p = await prisma.payrollPeriod.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { fiscalRuleVersion: true } });
  if (!p) fail(404, "Période introuvable.");
  const { from, to } = periodRange(p!.year, p!.month);
  const [payslips, elements, unvalidated] = await Promise.all([
    prisma.payslip.findMany({ where: { periodId: p!.id }, include: { employee: { select: { id: true, firstName: true, lastName: true, matricule: true, position: true } } }, orderBy: { employee: { lastName: "asc" } } }),
    prisma.payElement.findMany({ where: { organizationId: s.org.id, OR: [{ periodId: p!.id }, { periodId: null }] }, orderBy: { createdAt: "asc" } }),
    prisma.attendanceDay.count({ where: { organizationId: s.org.id, date: { gte: dbDate(from), lte: dbDate(to) }, validatedAt: null, workedMinutes: { gt: 0 } } }),
  ]);
  return {
    period: { id: p!.id, month: p!.month, year: p!.year, status: p!.status, currency: p!.currency, calculatedAt: p!.calculatedAt?.toISOString() ?? null, fiscal: p!.fiscalRuleVersion.label, fiscalData: p!.fiscalRuleVersion.data },
    unvalidatedDays: unvalidated,
    payslips: payslips.map((x) => ({
      id: x.id, employee: x.employee, hours: x.hours as Record<string, number>, lines: x.lines, gross: x.gross.toNumber(), cnss: x.cnssEmployee.toNumber(), amo: x.amoEmployee.toNumber(), ipe: x.ipeEmployee.toNumber(),
      profExpenses: x.profExpenses.toNumber(), taxableNet: x.taxableNet.toNumber(), ir: x.ir.toNumber(), net: x.net.toNumber(), employer: x.employerCharges as Record<string, number>, warnings: x.warnings,
    })),
    elements: elements.map((e) => ({ id: e.id, employeeId: e.employeeId, kind: e.kind, label: e.label, amount: e.amount.toNumber(), taxable: e.taxable, cnssSubject: e.cnssSubject, auto: !!e.sourceId })),
  };
});
