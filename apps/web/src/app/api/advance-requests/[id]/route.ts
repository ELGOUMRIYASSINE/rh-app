import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { notify } from "@/server/realtime";
import { simpleEmail } from "@/server/mail";

/** approve → e-mail to the accounting address; the advance becomes a payroll deduction. */
export const PATCH = route({ feature: "advances", allowEmployee: true, body: z.object({ action: z.enum(["approve", "reject", "cancel"]), note: z.string().max(500).optional() }) }, async ({ s, params, body, log }) => {
  const a = await prisma.advanceRequest.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { employee: { include: { membership: true } } } });
  if (!a) fail(404, "Demande introuvable.");
  if (a!.status !== "PENDING") fail(400, "Cette demande a déjà été traitée.");
  if (body.action === "cancel") {
    if (a!.employeeId !== s.employeeId && !canDo(s, "advances.validate", a!.employeeId)) fail(403, "Accès refusé.");
  } else {
    if (a!.employeeId === s.employeeId) fail(403, "Vous ne pouvez pas valider votre propre demande.");
    if (!canDo(s, "advances.validate", a!.employeeId)) fail(403, "Vous ne pouvez pas décider de cette demande.");
    if (body.action === "reject" && !body.note?.trim()) fail(400, "Indiquez le motif du refus.");
  }
  const status = body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : "CANCELLED";
  await prisma.advanceRequest.update({ where: { id: a!.id }, data: { status, decidedById: s.userId, decidedAt: new Date(), decisionNote: body.note ?? null } });
  const name = `${a!.employee.firstName} ${a!.employee.lastName}`;
  if (status === "APPROVED") {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: s.org.id } });
    if (org.accountingEmail) await simpleEmail(org.accountingEmail, `Acompte approuvé : ${name}`, "Acompte sur salaire approuvé", [`Salarié : ${name} (matricule ${a!.employee.matricule ?? ""})`, `Montant : ${a!.amount.toNumber().toFixed(2)} DH`, `Motif : ${a!.reason ?? ""}`, `Approuvé par ${s.user.firstName} ${s.user.lastName}. Il sera retenu sur la prochaine paie.`]);
  }
  if (a!.employee.membership && a!.employee.membership.userId !== s.userId) await notify(s.org.id, [a!.employee.membership.userId], { type: "advance", title: status === "APPROVED" ? "Acompte approuvé" : status === "REJECTED" ? "Acompte refusé" : "Acompte annulé", body: status === "REJECTED" ? `Motif : ${body.note}` : `Montant : ${a!.amount.toNumber()} DH.`, link: `/${s.org.slug}/salarie/acomptes` });
  await log(status === "APPROVED" ? "APPROVE" : status === "REJECTED" ? "REJECT" : "UPDATE", "ADVANCE_REQUEST", a!.id, { status, note: body.note });
  return { ok: true };
});
