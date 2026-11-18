import { z } from "zod";
import { prisma, dbDate } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { canDo } from "@/server/context";

/** Marquer absent justifié / injustifié (an unjustified absence is deducted in payroll). */
export const POST = route({ feature: "attendance", permission: "attendance.validate", body: z.object({ employeeId: z.string(), date: zDate, justified: z.boolean().nullable() }) }, async ({ s, body, log }) => {
  if (!canDo(s, "attendance.validate", body.employeeId)) fail(403, "Accès refusé.");
  const d = await prisma.attendanceDay.findFirst({ where: { organizationId: s.org.id, employeeId: body.employeeId, date: dbDate(body.date) } });
  if (!d) fail(404, "Aucune journée planifiée pour ce salarié.");
  if (d!.validatedAt) fail(409, "Journée déjà validée.");
  await prisma.attendanceDay.update({ where: { id: d!.id }, data: { justified: body.justified, status: body.justified === null ? d!.status : "ABSENT" } });
  await log("UPDATE", "ATTENDANCE", body.employeeId, { date: body.date, justified: body.justified });
  return { ok: true };
});
