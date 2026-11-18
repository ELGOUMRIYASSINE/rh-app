import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { ruleChange } from "@/server/audit";

export const DELETE = route({ feature: "planning", permission: "planning.manage" }, async ({ s, params, log }) => {
  const ex = await prisma.planningException.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!ex) fail(404, "Exception introuvable.");
  await prisma.planningException.delete({ where: { id: ex!.id } });
  await ruleChange(s.org.id, s.userId, "PLANNING_EXCEPTION", ex!.id, "DELETE", ex, null);
  await log("DELETE", "PLANNING_EXCEPTION", ex!.id);
  return { ok: true };
});
