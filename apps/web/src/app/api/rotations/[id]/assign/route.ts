import { z } from "zod";
import { prisma, dbDate } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { ruleChange } from "@/server/audit";

export const POST = route(
  { permission: "settings.manage", body: z.object({ target: z.enum(["service", "employee", "category"]), targetId: z.string().min(1), startDate: zDate, endDate: zDate.nullable().optional() }) },
  async ({ s, body, params, log }) => {
    const rot = await prisma.rotation.findFirst({ where: { id: params.id, organizationId: s.org.id } });
    if (!rot) fail(404, "Rotation introuvable.");
    const ok =
      body.target === "service" ? await prisma.service.count({ where: { id: body.targetId, organizationId: s.org.id } })
      : body.target === "employee" ? await prisma.employee.count({ where: { id: body.targetId, organizationId: s.org.id } })
      : await prisma.staffCategory.count({ where: { id: body.targetId, organizationId: s.org.id } });
    if (!ok) fail(400, "Cible invalide.");
    if (body.endDate && body.endDate < body.startDate) fail(400, "La date de fin doit suivre la date de début.");
    const a = await prisma.rotationAssignment.create({
      data: {
        rotationId: rot!.id,
        serviceId: body.target === "service" ? body.targetId : null,
        employeeId: body.target === "employee" ? body.targetId : null,
        staffCategoryId: body.target === "category" ? body.targetId : null,
        startDate: dbDate(body.startDate),
        endDate: body.endDate ? dbDate(body.endDate) : null,
      },
    });
    await ruleChange(s.org.id, s.userId, "ROTATION_ASSIGNMENT", a.id, "CREATE", null, a);
    await log("CREATE", "ROTATION_ASSIGNMENT", a.id, body);
    return { item: a };
  },
);

export const DELETE = route({ permission: "settings.manage", query: z.object({ assignmentId: z.string() }) }, async ({ s, query, params, log }) => {
  const a = await prisma.rotationAssignment.findFirst({ where: { id: query.assignmentId, rotationId: params.id, rotation: { organizationId: s.org.id } } });
  if (!a) fail(404, "Affectation introuvable.");
  await prisma.rotationAssignment.delete({ where: { id: a!.id } });
  await ruleChange(s.org.id, s.userId, "ROTATION_ASSIGNMENT", a!.id, "DELETE", a, null);
  await log("DELETE", "ROTATION_ASSIGNMENT", a!.id);
  return { ok: true };
});
