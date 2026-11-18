import { z } from "zod";
import { prisma, fiscalVersionFor } from "@yghr/db";
import { fail, route } from "@/server/api";

export const GET = route({ feature: "payroll", permission: "payroll.validate" }, async ({ s }) => {
  const periods = await prisma.payrollPeriod.findMany({ where: { organizationId: s.org.id }, orderBy: [{ year: "desc" }, { month: "desc" }], include: { payslips: { select: { gross: true, net: true, employerCharges: true, warnings: true } }, fiscalRuleVersion: { select: { label: true } } } });
  return {
    items: periods.map((p) => ({
      id: p.id, month: p.month, year: p.year, status: p.status, currency: p.currency, calculatedAt: p.calculatedAt?.toISOString() ?? null, lockedAt: p.lockedAt?.toISOString() ?? null, fiscal: p.fiscalRuleVersion.label,
      headcount: p.payslips.length,
      gross: p.payslips.reduce((t, x) => t + x.gross.toNumber(), 0),
      net: p.payslips.reduce((t, x) => t + x.net.toNumber(), 0),
      employer: p.payslips.reduce((t, x) => t + Number((x.employerCharges as { total?: number }).total ?? 0), 0),
      warnings: p.payslips.reduce((t, x) => t + x.warnings.length, 0),
    })),
  };
});

/** The server decides currency, dates and fiscal rule version. */
export const POST = route({ feature: "payroll", rhOnly: true, body: z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100) }) }, async ({ s, body, log }) => {
  if (await prisma.payrollPeriod.findUnique({ where: { organizationId_year_month: { organizationId: s.org.id, year: body.year, month: body.month } } })) fail(409, "Cette période de paie existe déjà.");
  const v = await fiscalVersionFor(prisma, body.year, body.month);
  const p = await prisma.payrollPeriod.create({ data: { organizationId: s.org.id, month: body.month, year: body.year, currency: s.org.currency, fiscalRuleVersionId: v.id } });
  await log("CREATE", "PAYROLLPERIOD", p.id, { month: body.month, year: body.year, fiscal: v.label });
  return { item: p };
});
