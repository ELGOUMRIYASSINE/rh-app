import { prisma, fromDbDate } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { lockedDays } from "@/server/planning";

export const DELETE = route({ feature: "planning", permission: "planning.manage" }, async ({ s, params, log }) => {
  const a = await prisma.shiftAssignment.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!a) fail(404, "Shift introuvable.");
  if (!canDo(s, "planning.manage", a!.employeeId)) fail(403, "Accès refusé.");
  const d = fromDbDate(a!.date);
  const locks = await lockedDays(s.org.id, d, d, [a!.employeeId]);
  if (locks.lockedMonths.length || locks.validated.length) fail(409, "Cette journée est verrouillée.");
  await prisma.shiftAssignment.delete({ where: { id: a!.id } });
  await log("DELETE", "SHIFT_ASSIGNMENT", a!.id, { date: d, employeeId: a!.employeeId });
  return { ok: true };
});
