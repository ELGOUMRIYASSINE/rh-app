import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";

export const POST = route({ feature: "employees", permission: "team.archive", body: z.object({ restore: z.boolean().optional() }) }, async ({ s, params, body, log }) => {
  if (!canDo(s, "team.archive", params.id)) fail(403, "Ce salarié ne fait pas partie de votre équipe.");
  const e = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!e) fail(404, "Salarié introuvable.");
  const status = body.restore ? "ACTIVE" : "ARCHIVED";
  await prisma.$transaction([
    prisma.employee.update({ where: { id: e!.id }, data: { status } }),
    prisma.membership.updateMany({ where: { employeeId: e!.id, organizationId: s.org.id, role: { not: "RH" } }, data: { active: !!body.restore } }),
  ]);
  await log("UPDATE", "EMPLOYEE", e!.id, { status });
  return { ok: true };
});
