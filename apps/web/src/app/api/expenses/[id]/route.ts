import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { notify } from "@/server/realtime";

export const PATCH = route({ feature: "expenses", allowEmployee: true, body: z.object({ action: z.enum(["approve", "reject", "cancel"]), note: z.string().max(500).optional() }) }, async ({ s, params, body, log }) => {
  const x = await prisma.expenseReport.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { employee: { include: { membership: true } } } });
  if (!x) fail(404, "Note de frais introuvable.");
  if (x!.status !== "PENDING") fail(400, "Cette note de frais a déjà été traitée.");
  if (body.action === "cancel") { if (x!.employeeId !== s.employeeId) fail(403, "Accès refusé."); }
  else {
    if (x!.employeeId === s.employeeId) fail(403, "Vous ne pouvez pas valider votre propre note de frais.");
    if (!canDo(s, "expenses.validate", x!.employeeId)) fail(403, "Accès refusé.");
  }
  const status = body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : "CANCELLED";
  await prisma.expenseReport.update({ where: { id: x!.id }, data: { status, decidedById: s.userId, decidedAt: new Date() } });
  if (x!.employee.membership && body.action !== "cancel") await notify(s.org.id, [x!.employee.membership.userId], { type: "expense", title: status === "APPROVED" ? "Note de frais approuvée ✅" : "Note de frais refusée", body: `${x!.category} · ${x!.amount.toNumber()} DH${body.note ? ` — ${body.note}` : ""}${status === "APPROVED" && x!.reimbursement === "PAYROLL" ? " · remboursée sur la prochaine paie" : ""}`, link: `/${s.org.slug}/salarie/notes-de-frais` });
  await log(status === "APPROVED" ? "APPROVE" : status === "REJECTED" ? "REJECT" : "UPDATE", "EXPENSE_REPORT", x!.id, { status, note: body.note });
  return { ok: true };
});
