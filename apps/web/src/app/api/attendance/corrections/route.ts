import { z } from "zod";
import { prisma, dbDate, localDateTimeToUtc, recomputeAttendance } from "@yghr/db";
import { addDays } from "@yghr/core";
import { fail, route, zDate, zTime } from "@/server/api";
import { canDo } from "@/server/context";
import { emit } from "@/server/realtime";

/** Add / move / delete a punch. A reason is mandatory; the change is saved as source=CORRECTION and audited. */
export const POST = route(
  { feature: "attendance", permission: "attendance.validate", body: z.object({ employeeId: z.string(), date: zDate, action: z.enum(["add", "move", "delete"]), punchId: z.string().optional(), time: zTime.optional(), nextDay: z.boolean().optional(), reason: z.string().trim().min(3, "Motif requis (3 caractères minimum)").max(300) }) },
  async ({ s, body, log }) => {
    if (!canDo(s, "attendance.validate", body.employeeId)) fail(403, "Ce salarié ne fait pas partie de votre équipe.");
    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, organizationId: s.org.id } });
    if (!emp) fail(404, "Salarié introuvable.");
    const day = await prisma.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: emp!.id, date: dbDate(body.date) } } });
    if (day?.validatedAt) fail(409, "Cette journée est validée : elle ne peut plus être corrigée.");
    const ts = body.time ? localDateTimeToUtc(body.nextDay ? addDays(body.date, 1) : body.date, body.time, s.org.timezone) : null;
    let detail: unknown;
    if (body.action === "add") {
      if (!ts) fail(400, "Heure requise.");
      const p = await prisma.punch.create({ data: { organizationId: s.org.id, employeeId: emp!.id, timestamp: ts!, source: "CORRECTION", reason: body.reason, createdById: s.userId } });
      detail = { added: p.id, at: ts };
    } else {
      const p = await prisma.punch.findFirst({ where: { id: body.punchId, organizationId: s.org.id, employeeId: emp!.id } });
      if (!p) fail(404, "Pointage introuvable.");
      if (body.action === "delete") {
        await prisma.punch.update({ where: { id: p!.id }, data: { deletedAt: new Date(), reason: body.reason } });
        detail = { deleted: p!.id, at: p!.timestamp };
      } else {
        if (!ts) fail(400, "Heure requise.");
        // Keep the original punch (soft-deleted) and create the corrected one.
        await prisma.punch.update({ where: { id: p!.id }, data: { deletedAt: new Date(), reason: `Déplacé : ${body.reason}` } });
        const n = await prisma.punch.create({ data: { organizationId: s.org.id, employeeId: emp!.id, timestamp: ts!, source: "CORRECTION", reason: body.reason, createdById: s.userId, rawPayload: { movedFrom: p!.id, original: (p!.rawPayload as { original?: string } | null)?.original ?? p!.timestamp.toISOString() } } });
        detail = { moved: p!.id, from: p!.timestamp, to: ts, newId: n.id };
      }
    }
    await recomputeAttendance(prisma, s.org.id, emp!.id, body.date, body.date);
    await emit(s.org.id, "attendance:update", { employeeId: emp!.id, date: body.date });
    await log("UPDATE", "PUNCH", emp!.id, { action: body.action, reason: body.reason, date: body.date, ...((detail as object) ?? {}) });
    return { ok: true };
  },
);
