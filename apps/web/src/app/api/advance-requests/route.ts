import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { notify, rhUserIds } from "@/server/realtime";

export const GET = route({ feature: "advances", allowEmployee: true }, async ({ s }) => {
  const scope = scopeEmployeeIds(s);
  const items = await prisma.advanceRequest.findMany({ where: { organizationId: s.org.id, ...(scope ? { employeeId: { in: scope } } : {}) }, include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return { items: items.map((a) => ({ id: a.id, employee: a.employee, amount: a.amount.toNumber(), reason: a.reason, status: a.status, decisionNote: a.decisionNote, createdAt: a.createdAt.toISOString(), decidedAt: a.decidedAt?.toISOString() ?? null, canDecide: a.status === "PENDING" && a.employeeId !== s.employeeId && canDo(s, "advances.validate", a.employeeId) })) };
});

export const POST = route({ feature: "advances", allowEmployee: true, body: z.object({ amount: z.number().positive("Montant invalide").max(100_000), reason: z.string().trim().max(500).optional(), employeeId: z.string().optional() }) }, async ({ s, body, log }) => {
  const employeeId = body.employeeId && body.employeeId !== s.employeeId ? body.employeeId : s.employeeId;
  if (!employeeId) fail(400, "Aucune fiche salarié liée à votre compte.");
  if (employeeId !== s.employeeId && !canDo(s, "advances.validate", employeeId)) fail(403, "Accès refusé.");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId!, organizationId: s.org.id } });
  if (!emp) fail(404, "Salarié introuvable.");
  if (await prisma.advanceRequest.count({ where: { employeeId: emp!.id, status: "PENDING" } })) fail(409, "Une demande d'acompte est déjà en attente.");
  const a = await prisma.advanceRequest.create({ data: { organizationId: s.org.id, employeeId: emp!.id, amount: body.amount, reason: body.reason || null } });
  const lead = emp!.teamLeadId ? await prisma.membership.findFirst({ where: { employeeId: emp!.teamLeadId, active: true } }) : null;
  await notify(s.org.id, [...new Set([...(await rhUserIds(s.org.id)), ...(lead ? [lead.userId] : [])])].filter((u) => u !== s.userId), { type: "advance", title: "Demande d'acompte", body: `${emp!.firstName} ${emp!.lastName} demande un acompte de ${body.amount} DH.`, link: `/${s.org.slug}/rh/acomptes` });
  await log("CREATE", "ADVANCE_REQUEST", a.id, { amount: body.amount });
  return { item: a };
});
