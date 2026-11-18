import { z } from "zod";
import { prisma, dbDate, fromDbDate, analyzeOrgPlanning, recomputeAttendance, todayIn } from "@yghr/db";
import { blockingAnomalies } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { emit, notify } from "@/server/realtime";

/** Publish the drafts of the range. Blocked while blocking anomalies remain without an exception. */
export const POST = route({ feature: "planning", permission: "planning.manage", body: z.object({ from: zDate, to: zDate }) }, async ({ s, body, log }) => {
  const scope = scopeEmployeeIds(s);
  const anomalies = await analyzeOrgPlanning(prisma, s.org.id, body.from, body.to, scope ? { employeeIds: scope } : {});
  const blocking = blockingAnomalies(anomalies);
  if (blocking.length) fail(409, `${blocking.length} anomalie(s) bloquante(s) à corriger ou à couvrir par une exception avant de publier.`, { blocking: blocking.length });
  const where = { organizationId: s.org.id, status: "DRAFT" as const, date: { gte: dbDate(body.from), lte: dbDate(body.to) }, ...(scope ? { employeeId: { in: scope } } : {}) };
  const drafts = await prisma.shiftAssignment.findMany({ where, select: { employeeId: true, date: true } });
  if (!drafts.length) return { published: 0, message: "Aucun brouillon à publier sur cette période." };
  await prisma.shiftAssignment.updateMany({ where, data: { status: "PUBLISHED" } });
  const empIds = [...new Set(drafts.map((d) => d.employeeId))];
  const users = await prisma.membership.findMany({ where: { organizationId: s.org.id, employeeId: { in: empIds }, active: true }, select: { userId: true, role: true } });
  await notify(s.org.id, users.map((u) => u.userId), { type: "planning", title: "Planning publié", body: `Votre planning du ${body.from.split("-").reverse().join("/")} au ${body.to.split("-").reverse().join("/")} est disponible.`, link: `/${s.org.slug}/salarie/planning` });
  await emit(s.org.id, "planning:published", { from: body.from, to: body.to });
  // Past days changed: recompute attendance.
  const today = todayIn(s.org.timezone);
  if (body.from <= today) for (const id of empIds) await recomputeAttendance(prisma, s.org.id, id, body.from, body.to < today ? body.to : today);
  await log("PUBLISH", "PLANNING", null, { from: body.from, to: body.to, cells: drafts.length, employees: empIds.length, dates: [...new Set(drafts.map((d) => fromDbDate(d.date)))].length });
  return { published: drafts.length, employees: empIds.length };
});
