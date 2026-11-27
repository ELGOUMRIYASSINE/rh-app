import { z } from "zod";
import { BALANCE_LEAVE_TYPES, checkLeaveRequest, LEAVE_TYPE_LABELS, LEAVE_TYPES } from "@yghr/core";
import { prisma, dbDate, fromDbDate, type Prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { balancesFor, leaveDays } from "@/server/leave";
import { notify, rhUserIds, emit } from "@/server/realtime";
import { saveUpload } from "@/server/storage";

export const GET = route(
  { feature: "leaves", allowEmployee: true, query: z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"]).optional(), type: z.string().optional(), q: z.string().optional(), sort: z.enum(["recent", "oldest", "start"]).optional() }) },
  async ({ s, query }) => {
    const scope = scopeEmployeeIds(s);
    const base: Prisma.LeaveRequestWhereInput = { organizationId: s.org.id, ...(scope ? { employeeId: { in: scope } } : {}), ...(query.type ? { type: query.type as never } : {}), ...(query.q ? { employee: { OR: [{ firstName: { contains: query.q, mode: "insensitive" } }, { lastName: { contains: query.q, mode: "insensitive" } }] } } : {}) };
    const [items, counts] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { ...base, ...(query.status && query.status !== "ALL" ? { status: query.status } : {}) },
        orderBy: query.sort === "oldest" ? { createdAt: "asc" } : query.sort === "start" ? { startDate: "asc" } : { createdAt: "desc" },
        include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } },
        take: 300,
      }),
      prisma.leaveRequest.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const deciders = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.decidedById).filter(Boolean) as string[])] } }, select: { id: true, firstName: true, lastName: true } });
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: items.map((l) => ({
        id: l.id, employee: l.employee, type: l.type, label: LEAVE_TYPE_LABELS[l.type], startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate), halfDayStart: l.halfDayStart, halfDayEnd: l.halfDayEnd,
        days: l.days.toNumber(), comment: l.comment, attachmentUrl: l.attachmentUrl, status: l.status, decisionNote: l.decisionNote, decidedAt: l.decidedAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString(),
        decidedBy: deciders.find((d) => d.id === l.decidedById) ?? null,
        canDecide: l.status === "PENDING" && l.employeeId !== s.employeeId && canDo(s, "leaves.approve", l.employeeId),
      })),
    };
  },
);

const Body = z.object({
  employeeId: z.string().nullable().optional(),
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  halfDayStart: z.coerce.boolean().optional(),
  halfDayEnd: z.coerce.boolean().optional(),
  comment: z.string().max(1000).nullable().optional(),
});

/** multipart (with optional attachment) or JSON. */
export const POST = route({ feature: "leaves", allowEmployee: true }, async ({ s, req, log }) => {
  let raw: Record<string, unknown>;
  let file: File | null = null;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const f = await req.formData();
    raw = Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
    raw.halfDayStart = raw.halfDayStart === "true";
    raw.halfDayEnd = raw.halfDayEnd === "true";
    const a = f.get("attachment");
    if (a instanceof File && a.size) file = a;
  } else raw = await req.json();
  const body = Body.parse(raw);
  const employeeId = body.employeeId || s.employeeId;
  if (!employeeId) fail(400, "Choisissez un bénéficiaire.");
  const forSelf = employeeId === s.employeeId;
  if (!forSelf && !canDo(s, "leaves.approve", employeeId)) fail(403, "Vous ne pouvez pas créer de demande pour ce salarié.");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId!, organizationId: s.org.id, status: "ACTIVE" } });
  if (!emp) fail(404, "Salarié introuvable.");
  if (body.endDate < body.startDate) fail(400, "La date de fin doit être postérieure à la date de début.");
  const { days } = await leaveDays(s.org.id, body.type, body.startDate, body.endDate, body.halfDayStart, body.halfDayEnd);
  if (days <= 0) fail(400, "Cette période ne contient aucun jour décompté (week-end ou jours fériés).");
  const others = await prisma.leaveRequest.findMany({ where: { employeeId: emp!.id, status: { in: ["PENDING", "APPROVED"] } } });
  const check = checkLeaveRequest({ days, balance: null, startDate: body.startDate, endDate: body.endDate, otherRequests: others.map((o) => ({ startDate: fromDbDate(o.startDate), endDate: fromDbDate(o.endDate), status: o.status })), plannedShiftDates: [] });
  if (check.overlapsRequest) fail(409, "Cette période chevauche une autre demande en attente ou approuvée.");
  if (BALANCE_LEAVE_TYPES.includes(body.type)) {
    const bal = (await balancesFor(s.org.id, emp!.id)).find((b) => b.type === body.type);
    if (bal?.needsDeclaration) fail(400, forSelf ? `Déclarez d'abord votre solde annuel de congés ${bal.periodYear} (nombre de jours auxquels vous avez droit).` : `Le solde annuel ${bal.periodYear} de ${emp!.firstName} ${emp!.lastName} n'est pas encore déclaré.`);
    // DECISION: nobody can exceed the remaining balance (days already pending are reserved).
    if (bal && days > bal.available - bal.pending) fail(400, `Solde insuffisant : ${Math.max(0, Math.round((bal.available - bal.pending) * 100) / 100)} j disponible(s) pour ${days} j demandé(s).`);
  }
  const attachment = file ? await saveUpload(s.org.id, "leaves", file).catch((e: Error) => fail(400, e.message)) : null;
  const l = await prisma.leaveRequest.create({
    data: { organizationId: s.org.id, employeeId: emp!.id, type: body.type, startDate: dbDate(body.startDate), endDate: dbDate(body.endDate), halfDayStart: !!body.halfDayStart, halfDayEnd: !!body.halfDayEnd, days, comment: body.comment ?? null, attachmentUrl: attachment?.url ?? null, createdById: s.userId },
  });
  // Notify the approvers: team lead (if any) and RH.
  const leadUser = emp!.teamLeadId ? await prisma.membership.findFirst({ where: { employeeId: emp!.teamLeadId, organizationId: s.org.id, active: true } }) : null;
  const to = [...new Set([...(await rhUserIds(s.org.id)), ...(leadUser ? [leadUser.userId] : [])])].filter((u) => u !== s.userId);
  await notify(s.org.id, to, { type: "leave", title: "Nouvelle demande de congé", body: `${emp!.firstName} ${emp!.lastName} demande ${days} j (${LEAVE_TYPE_LABELS[body.type]}) du ${body.startDate.split("-").reverse().join("/")} au ${body.endDate.split("-").reverse().join("/")}.`, link: `/${s.org.slug}/rh/conges` });
  await emit(s.org.id, "leave:updated", { id: l.id });
  await log("CREATE", "LEAVE_REQUEST", l.id, { employee: `${emp!.firstName} ${emp!.lastName}`, type: body.type, days });
  return { item: { id: l.id, days } };
});
