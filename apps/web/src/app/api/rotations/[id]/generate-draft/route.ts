import { z } from "zod";
import { prisma, dbDate, fromDbDate } from "@yghr/db";
import { generateRotationDraft, diffDays } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";

/**
 * Creates DRAFT cells for the rotation's targets. Never overwrites published cells unless
 * `overwritePublished` is confirmed; existing drafts on the same day are replaced.
 */
export const POST = route(
  { feature: "planning", permission: "planning.manage", body: z.object({ from: zDate, to: zDate, overwritePublished: z.boolean().optional() }) },
  async ({ s, body, params, log }) => {
    if (body.to < body.from) fail(400, "Période invalide.");
    if (diffDays(body.to, body.from) > 92) fail(400, "Période limitée à 3 mois.");
    const rot = await prisma.rotation.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { assignments: true } });
    if (!rot) fail(404, "Rotation introuvable.");
    if (!rot!.assignments.length) fail(400, "Affectez d'abord la rotation à un service, une catégorie ou un salarié.");
    let created = 0;
    let skippedPublished = 0;
    for (const ra of rot!.assignments) {
      const emps = await prisma.employee.findMany({
        where: { organizationId: s.org.id, status: "ACTIVE", ...(ra.employeeId ? { id: ra.employeeId } : {}), ...(ra.serviceId ? { serviceId: ra.serviceId } : {}), ...(ra.staffCategoryId ? { staffCategoryId: ra.staffCategoryId } : {}) },
        select: { id: true },
      });
      const from = fromDbDate(ra.startDate) > body.from ? fromDbDate(ra.startDate) : body.from;
      const cells = generateRotationDraft({ unit: rot!.unit, sequence: rot!.sequence as string[], workDays: rot!.workDays }, fromDbDate(ra.startDate), emps.map((e) => e.id), from, body.to, ra.endDate ? fromDbDate(ra.endDate) : null);
      for (const c of cells) {
        const existing = await prisma.shiftAssignment.findMany({ where: { organizationId: s.org.id, employeeId: c.employeeId, date: dbDate(c.date) } });
        if (existing.some((e) => e.status === "PUBLISHED") && !body.overwritePublished) {
          skippedPublished++;
          continue;
        }
        if (existing.some((e) => e.leaveRequestId)) continue;
        await prisma.shiftAssignment.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
        await prisma.shiftAssignment.create({ data: { organizationId: s.org.id, employeeId: c.employeeId, date: dbDate(c.date), shiftTypeId: c.shiftTypeId, status: "DRAFT", source: "ROTATION" } });
        created++;
      }
    }
    await log("CREATE", "PLANNING_DRAFT", rot!.id, { from: body.from, to: body.to, created, skippedPublished });
    return { created, skippedPublished };
  },
);
