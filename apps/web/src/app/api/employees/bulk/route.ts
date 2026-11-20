import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

export const POST = route(
  { feature: "employees", rhOnly: true, body: z.object({ ids: z.array(z.string()).min(1).max(500), action: z.enum(["archive", "restore", "teamLead", "service", "category", "centre"]), value: z.string().nullable().optional() }) },
  async ({ s, body, log }) => {
    const ids = (await prisma.employee.findMany({ where: { id: { in: body.ids }, organizationId: s.org.id }, select: { id: true } })).map((e) => e.id);
    if (!ids.length) fail(400, "Aucun salarié sélectionné.");
    const v = body.value || null;
    if (v) {
      const ok =
        body.action === "teamLead" ? await prisma.employee.count({ where: { id: v, organizationId: s.org.id } })
        : body.action === "service" ? await prisma.service.count({ where: { id: v, organizationId: s.org.id } })
        : body.action === "centre" ? await prisma.centre.count({ where: { id: v, organizationId: s.org.id } })
        : body.action === "category" ? await prisma.staffCategory.count({ where: { id: v, organizationId: s.org.id } })
        : 1;
      if (!ok) fail(400, "Valeur invalide.");
    }
    const where = { id: { in: ids.filter((id) => !(body.action === "teamLead" && id === v)) }, organizationId: s.org.id };
    if (body.action === "archive" || body.action === "restore") {
      await prisma.employee.updateMany({ where, data: { status: body.action === "archive" ? "ARCHIVED" : "ACTIVE" } });
      await prisma.membership.updateMany({ where: { employeeId: { in: ids }, organizationId: s.org.id, role: { not: "RH" } }, data: { active: body.action === "restore" } });
    } else if (body.action === "teamLead") await prisma.employee.updateMany({ where, data: { teamLeadId: v } });
    else if (body.action === "centre") await prisma.employee.updateMany({ where, data: { centreId: v } });
    else if (body.action === "service") await prisma.employee.updateMany({ where, data: { serviceId: v } });
    else await prisma.employee.updateMany({ where, data: { staffCategoryId: v } });
    await log("UPDATE", "EMPLOYEE", null, { bulk: body.action, value: v, count: ids.length });
    return { count: ids.length };
  },
);
