import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

async function editable(orgId: string, id: string) {
  const p = await prisma.payrollPeriod.findFirst({ where: { id, organizationId: orgId } });
  if (!p) fail(404, "Période introuvable.");
  if (p!.status === "VALIDATED" || p!.status === "LOCKED") fail(409, "Période validée ou verrouillée : les éléments de paie ne sont plus modifiables.");
  return p!;
}

/** Add a pay element (prime, transport, retenue…). The period goes back to DRAFT until recalculated. */
export const POST = route(
  { feature: "payroll", rhOnly: true, body: z.object({ employeeId: z.string(), kind: z.enum(["PRIME", "TRANSPORT", "ADVANCE", "EXPENSE", "DEDUCTION"]), label: z.string().trim().min(2).max(80), amount: z.number().positive().max(1_000_000), taxable: z.boolean(), cnssSubject: z.boolean() }) },
  async ({ s, params, body, log }) => {
    const p = await editable(s.org.id, params.id!);
    if (!(await prisma.employee.count({ where: { id: body.employeeId, organizationId: s.org.id } }))) fail(400, "Salarié inconnu.");
    const e = await prisma.payElement.create({ data: { ...body, organizationId: s.org.id, periodId: p.id } });
    await prisma.payrollPeriod.update({ where: { id: p.id }, data: { status: "DRAFT" } });
    await log("CREATE", "PAY_ELEMENT", e.id, body);
    return { item: e };
  },
);

export const DELETE = route({ feature: "payroll", rhOnly: true, query: z.object({ elementId: z.string() }) }, async ({ s, params, query, log }) => {
  const p = await editable(s.org.id, params.id!);
  const e = await prisma.payElement.findFirst({ where: { id: query.elementId, organizationId: s.org.id } });
  if (!e) fail(404, "Élément introuvable.");
  if (e!.sourceId) fail(400, "Cet élément provient d'un acompte ou d'une note de frais : modifiez la demande d'origine.");
  await prisma.payElement.delete({ where: { id: e!.id } });
  await prisma.payrollPeriod.update({ where: { id: p.id }, data: { status: "DRAFT" } });
  await log("DELETE", "PAY_ELEMENT", e!.id, { label: e!.label, amount: e!.amount });
  return { ok: true };
});
