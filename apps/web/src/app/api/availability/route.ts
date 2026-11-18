import { z } from "zod";
import { prisma, dbDate, fromDbDate } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";

export const GET = route({ feature: "availability", allowEmployee: true, query: z.object({ from: zDate, to: zDate }) }, async ({ s, query }) => {
  const scope = scopeEmployeeIds(s);
  const rows = await prisma.availability.findMany({ where: { organizationId: s.org.id, date: { gte: dbDate(query.from), lte: dbDate(query.to) }, ...(scope ? { employeeId: { in: scope } } : {}) } });
  return { items: rows.map((r) => ({ employeeId: r.employeeId, date: fromDbDate(r.date), available: r.available, note: r.note })) };
});

/** Declare a day as available / unavailable (null clears). Employees for themselves; RH for anyone. */
export const PUT = route({ feature: "availability", allowEmployee: true, body: z.object({ employeeId: z.string().optional(), dates: z.array(zDate).min(1).max(62), available: z.boolean().nullable(), note: z.string().max(200).optional() }) }, async ({ s, body, log }) => {
  const employeeId = body.employeeId ?? s.employeeId;
  if (!employeeId) fail(400, "Aucune fiche salarié liée à votre compte.");
  if (employeeId !== s.employeeId && s.role !== "RH") fail(403, "Accès refusé.");
  if (!(await prisma.employee.count({ where: { id: employeeId!, organizationId: s.org.id } }))) fail(404, "Salarié introuvable.");
  for (const d of body.dates) {
    if (body.available === null) await prisma.availability.deleteMany({ where: { employeeId: employeeId!, date: dbDate(d) } });
    else await prisma.availability.upsert({ where: { employeeId_date: { employeeId: employeeId!, date: dbDate(d) } }, create: { organizationId: s.org.id, employeeId: employeeId!, date: dbDate(d), available: body.available, note: body.note ?? null }, update: { available: body.available, note: body.note ?? null } });
  }
  await log("UPDATE", "AVAILABILITY", employeeId, { dates: body.dates, available: body.available });
  return { ok: true };
});
