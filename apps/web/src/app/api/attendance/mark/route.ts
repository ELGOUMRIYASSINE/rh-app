import { z } from "zod";
import { prisma, dbDate } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { canDo } from "@/server/context";

const ABSENCE_REASONS = ["SICK", "WORK_ACCIDENT", "LEAVE", "AUTHORIZED", "TRAINING", "FAMILY", "UNJUSTIFIED", "OTHER"] as const;

/**
 * Record why an employee was absent (RH / team lead). An unjustified absence is deducted in payroll;
 * every other reason counts as justified. `reason: null` removes the marking.
 */
export const POST = route(
  { feature: "attendance", permission: "attendance.validate", body: z.object({ employeeId: z.string(), date: zDate, reason: z.enum(ABSENCE_REASONS).nullable().optional(), note: z.string().trim().max(500).nullable().optional(), justified: z.boolean().nullable().optional() }) },
  async ({ s, body, log }) => {
    if (!canDo(s, "attendance.validate", body.employeeId)) fail(403, "Accès refusé.");
    const d = await prisma.attendanceDay.findFirst({ where: { organizationId: s.org.id, employeeId: body.employeeId, date: dbDate(body.date) } });
    if (!d) fail(404, "Aucune journée planifiée pour ce salarié.");
    if (d!.validatedAt) fail(409, "Journée déjà validée.");
    // Older clients send only `justified`.
    const reason = body.reason !== undefined ? body.reason : body.justified === null ? null : body.justified === false ? "UNJUSTIFIED" : body.justified ? "OTHER" : null;
    await prisma.attendanceDay.update({
      where: { id: d!.id },
      data: reason === null
        ? { justified: null, absenceReason: null, absenceNote: null }
        : { justified: reason !== "UNJUSTIFIED", absenceReason: reason, absenceNote: body.note || null, status: "ABSENT" },
    });
    await log("UPDATE", "ATTENDANCE", body.employeeId, { date: body.date, absence: reason, note: body.note ?? null });
    return { ok: true };
  },
);
