import { z } from "zod";
import { normalizePermissions } from "@yghr/core";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

export const PATCH = route(
  { feature: "employees", rhOnly: true, body: z.object({ permissions: z.record(z.string(), z.boolean()).optional(), memberIds: z.array(z.string()).optional(), revoke: z.boolean().optional() }) },
  async ({ s, params, body, log }) => {
    const m = await prisma.membership.findFirst({ where: { id: params.membershipId, organizationId: s.org.id, role: "CHEF" } });
    if (!m) fail(404, "Chef d'équipe introuvable.");
    if (body.revoke) {
      await prisma.membership.update({ where: { id: m!.id }, data: { role: "SALARIE", permissions: undefined } });
      if (m!.employeeId) await prisma.employee.updateMany({ where: { teamLeadId: m!.employeeId, organizationId: s.org.id }, data: { teamLeadId: null } });
      await log("UPDATE", "TEAM_LEAD", m!.employeeId, { revoked: true });
      return { ok: true };
    }
    const before = normalizePermissions(m!.permissions);
    if (body.permissions) await prisma.membership.update({ where: { id: m!.id }, data: { permissions: normalizePermissions(body.permissions) } });
    if (body.memberIds && m!.employeeId) {
      await prisma.employee.updateMany({ where: { teamLeadId: m!.employeeId, organizationId: s.org.id, id: { notIn: body.memberIds } }, data: { teamLeadId: null } });
      await prisma.employee.updateMany({ where: { id: { in: body.memberIds.filter((x) => x !== m!.employeeId) }, organizationId: s.org.id }, data: { teamLeadId: m!.employeeId } });
    }
    await log("UPDATE", "PERMISSIONS", m!.id, { before, after: body.permissions, members: body.memberIds?.length });
    return { ok: true };
  },
);
