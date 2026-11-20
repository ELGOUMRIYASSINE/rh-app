import { z } from "zod";
import { addDays, LEAVE_TYPE_LABELS, eachDay } from "@yghr/core";
import { prisma, dbDate, fromDbDate, recomputeAttendance, todayIn } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { emit, notify } from "@/server/realtime";

/** approve | reject | cancel. Approval writes into the planning (replaces shifts), updates balances, notifies. */
export const PATCH = route({ feature: "leaves", allowEmployee: true, body: z.object({ action: z.enum(["approve", "reject", "cancel"]), note: z.string().max(500).optional() }) }, async ({ s, params, body, log }) => {
  const l = await prisma.leaveRequest.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { employee: { include: { membership: true } } } });
  if (!l) fail(404, "Demande introuvable.");
  const own = l!.employeeId === s.employeeId;
  if (body.action === "cancel") {
    if (!own && !canDo(s, "leaves.approve", l!.employeeId)) fail(403, "Accès refusé.");
    if (own && l!.status === "APPROVED" && s.role === "SALARIE" && fromDbDate(l!.startDate) <= todayIn(s.org.timezone)) fail(400, "Ce congé a commencé : contactez votre responsable RH pour l'annuler.");
    if (l!.status === "CANCELLED" || l!.status === "REJECTED") fail(400, "Cette demande est déjà clôturée.");
  } else {
    if (own) fail(403, "Vous ne pouvez pas valider votre propre demande : elle est transmise au responsable RH.");
    if (!canDo(s, "leaves.approve", l!.employeeId)) fail(403, "Vous ne pouvez pas décider de cette demande.");
    if (l!.status !== "PENDING") fail(400, "Cette demande a déjà été traitée.");
    if (body.action === "reject" && !body.note?.trim()) fail(400, "Indiquez le motif du refus.");
  }
  const status = body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : "CANCELLED";
  const from = fromDbDate(l!.startDate);
  const to = fromDbDate(l!.endDate);
  let replaced = 0;
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: l!.id }, data: { status, decidedById: s.userId, decidedAt: new Date(), decisionNote: body.note ?? null } });
    if (status === "APPROVED") {
      // DECISION: shifts covered by the leave are removed from the planning (count kept in the audit log).
      const r = await tx.shiftAssignment.deleteMany({ where: { organizationId: s.org.id, employeeId: l!.employeeId, date: { gte: dbDate(from), lte: dbDate(to) }, leaveRequestId: null } });
      replaced = r.count;
    }
  });
  const today = todayIn(s.org.timezone);
  if (from <= today) await recomputeAttendance(prisma, s.org.id, l!.employeeId, from, to < today ? to : today);
  const userId = l!.employee.membership?.userId;
  const label = LEAVE_TYPE_LABELS[l!.type];
  if (userId && userId !== s.userId) {
    const msg = status === "APPROVED" ? `Votre demande (${label}, ${l!.days} j) a été approuvée.` : status === "REJECTED" ? `Votre demande (${label}) a été refusée${body.note ? ` : ${body.note}` : "."}` : `Votre demande (${label}) a été annulée.`;
    await notify(s.org.id, [userId], { type: "leave", title: status === "APPROVED" ? "Congé approuvé" : status === "REJECTED" ? "Congé refusé" : "Congé annulé", body: msg, link: `/${s.org.slug}/salarie/conges` });
  }
  await emit(s.org.id, "leave:updated", { id: l!.id, status });
  await log(status === "APPROVED" ? "APPROVE" : status === "REJECTED" ? "REJECT" : "UPDATE", "LEAVE_REQUEST", l!.id, { status, note: body.note, replacedShifts: replaced, days: eachDay(from, to).length });
  return { ok: true, replacedShifts: replaced };
});
