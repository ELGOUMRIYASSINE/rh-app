import { z } from "zod";
import { prisma, dbDate, todayIn } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { dayDetail } from "@/server/attendance";

/** Validate (lock) the day for the employees concerned. Payroll uses validated days. */
export const POST = route({ feature: "attendance", permission: "attendance.validate", body: z.object({ date: zDate, unvalidate: z.boolean().optional() }) }, async ({ s, body, log }) => {
  if (body.date > todayIn(s.org.timezone)) fail(400, "Impossible de valider une journée future.");
  const scope = scopeEmployeeIds(s);
  if (body.unvalidate) {
    if (s.role !== "RH") fail(403, "Seul le responsable RH peut dévalider une journée.");
    const r = await prisma.attendanceDay.updateMany({ where: { organizationId: s.org.id, date: dbDate(body.date), ...(scope ? { employeeId: { in: scope } } : {}) }, data: { validatedAt: null, validatedById: null } });
    await log("UPDATE", "ATTENDANCE", null, { unvalidate: body.date, count: r.count });
    return { count: r.count };
  }
  const detail = await dayDetail(s.org.id, body.date, scope); // recomputes first
  const missing = detail.rows.filter((r) => r.day?.issues.includes("MISSING_OUT")).length;
  const r = await prisma.attendanceDay.updateMany({ where: { organizationId: s.org.id, date: dbDate(body.date), validatedAt: null, employeeId: { in: detail.rows.map((x) => x.employeeId) } }, data: { validatedAt: new Date(), validatedById: s.userId } });
  await log("VALIDATE", "ATTENDANCE", null, { date: body.date, count: r.count, missingOut: missing });
  return { count: r.count, warning: missing ? `${missing} sortie(s) manquante(s) validée(s) telle(s) quelle(s).` : null };
});
