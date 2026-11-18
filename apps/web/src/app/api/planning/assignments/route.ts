import { z } from "zod";
import { prisma, dbDate } from "@yghr/db";
import { fail, route, zDate, zTime } from "@/server/api";
import { canDo } from "@/server/context";
import { lockedDays } from "@/server/planning";

const Cell = z.object({
  employeeId: z.string(),
  date: zDate,
  shiftTypeId: z.string().nullable().optional(),
  customStart: zTime.nullable().optional(),
  customEnd: zTime.nullable().optional(),
  breakMinutes: z.number().int().min(0).max(240).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  /** true = empty the cell */
  clear: z.boolean().optional(),
});

/**
 * Bulk upsert of planning cells. DECISION: the grid holds one shift per employee per day;
 * writing a cell replaces its non-leave assignment. Every edit produces a DRAFT that must be published.
 */
export const POST = route({ feature: "planning", permission: "planning.manage", body: z.object({ cells: z.array(Cell).min(1).max(2000) }) }, async ({ s, body, log }) => {
  const empIds = [...new Set(body.cells.map((c) => c.employeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds }, organizationId: s.org.id, status: "ACTIVE" }, select: { id: true } });
  if (emps.length !== empIds.length) fail(400, "Salarié inconnu dans la sélection.");
  if (s.role === "CHEF" && empIds.some((id) => !canDo(s, "planning.manage", id))) fail(403, "Vous ne pouvez planifier que les membres de votre équipe.");
  const stIds = [...new Set(body.cells.map((c) => c.shiftTypeId).filter(Boolean) as string[])];
  if (stIds.length && (await prisma.shiftType.count({ where: { id: { in: stIds }, organizationId: s.org.id } })) !== stIds.length) fail(400, "Type de shift inconnu.");
  const dates = body.cells.map((c) => c.date).sort();
  const locks = await lockedDays(s.org.id, dates[0]!, dates[dates.length - 1]!, empIds);
  const validated = new Set(locks.validated);
  for (const c of body.cells) {
    if (locks.lockedMonths.includes(c.date.slice(0, 7))) fail(409, `Le mois ${c.date.slice(0, 7)} est validé en paie : le planning est verrouillé.`);
    if (validated.has(`${c.employeeId}:${c.date}`)) fail(409, `La journée du ${c.date} est déjà validée pour ce salarié.`);
    if (!c.clear && !c.shiftTypeId && !(c.customStart && c.customEnd)) fail(400, "Choisissez un shift ou des horaires.");
  }
  let written = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of body.cells) {
      await tx.shiftAssignment.deleteMany({ where: { organizationId: s.org.id, employeeId: c.employeeId, date: dbDate(c.date), leaveRequestId: null } });
      if (c.clear) continue;
      await tx.shiftAssignment.create({
        data: { organizationId: s.org.id, employeeId: c.employeeId, date: dbDate(c.date), shiftTypeId: c.shiftTypeId ?? null, customStart: c.customStart ?? null, customEnd: c.customEnd ?? null, breakMinutes: c.breakMinutes ?? null, note: c.note ?? null, status: "DRAFT", source: "MANUAL" },
      });
      written++;
    }
  });
  await log("UPDATE", "PLANNING", null, { cells: body.cells.length, written, from: dates[0], to: dates[dates.length - 1] });
  return { ok: true, written };
});
