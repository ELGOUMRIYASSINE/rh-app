import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { assertRefs, EmployeeInput, employeeData } from "@/server/employees";

const RATE_FIELDS = ["hourlyRate", "netHourlyRate", "monthlyBase"] as const;

export const GET = route({ feature: "employees" }, async ({ s, params }) => {
  if (s.role === "CHEF" && !s.subordinateIds.includes(params.id!) && s.employeeId !== params.id) fail(404, "Salarié introuvable.");
  const e = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { service: true, staffCategory: true, teamLead: { select: { id: true, firstName: true, lastName: true } } } });
  if (!e) fail(404, "Salarié introuvable.");
  const showRates = canDo(s, "rates.view", params.id);
  return { employee: showRates ? e : { ...e, hourlyRate: null, netHourlyRate: null, monthlyBase: null } };
});

export const PATCH = route({ feature: "employees", permission: "team.edit", body: EmployeeInput.partial() }, async ({ s, params, body, log }) => {
  if (!canDo(s, "team.edit", params.id)) fail(403, "Ce salarié ne fait pas partie de votre équipe.");
  if (RATE_FIELDS.some((f) => f in body) && !canDo(s, "rates.edit", params.id)) fail(403, "Vous ne pouvez pas modifier les taux de rémunération.");
  if (s.role === "CHEF" && "teamLeadId" in body) delete (body as Record<string, unknown>).teamLeadId;
  const before = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!before) fail(404, "Salarié introuvable.");
  if (body.teamLeadId === params.id) fail(400, "Un salarié ne peut pas être son propre chef d'équipe.");
  await assertRefs(s.org.id, body);
  if (body.email && body.email !== before!.email && (await prisma.employee.findFirst({ where: { organizationId: s.org.id, email: body.email, id: { not: params.id } } }))) fail(409, "Un autre salarié utilise déjà cet e-mail.");
  const updated = await prisma.employee.update({ where: { id: params.id, organizationId: s.org.id }, data: employeeData(body) });
  const changed = Object.fromEntries(Object.keys(body).map((k) => [k, { before: (before as Record<string, unknown>)[k], after: (updated as Record<string, unknown>)[k] }]));
  await log("UPDATE", "EMPLOYEE", params.id, changed);
  return { employee: updated };
});

/** Hard delete only for employees with no history; otherwise archive. */
export const DELETE = route({ feature: "employees", permission: "team.archive" }, async ({ s, params, log }) => {
  if (!canDo(s, "team.archive", params.id)) fail(403, "Ce salarié ne fait pas partie de votre équipe.");
  const e = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { _count: { select: { punches: true, payslips: true, assignments: true } } } });
  if (!e) fail(404, "Salarié introuvable.");
  if (e!._count.punches || e!._count.payslips || e!._count.assignments) fail(400, "Ce salarié a un historique (pointages, planning ou paie) : archivez-le plutôt que de le supprimer.");
  await prisma.employee.delete({ where: { id: e!.id } });
  await log("DELETE", "EMPLOYEE", e!.id, { name: `${e!.firstName} ${e!.lastName}` });
  return { ok: true };
});
