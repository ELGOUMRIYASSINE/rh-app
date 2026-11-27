import { z } from "zod";
import { normalizePermissions } from "@yghr/core";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { provisionAccess } from "@/server/employees";

export const GET = route({ feature: "employees", rhOnly: true }, async ({ s }) => {
  const leads = await prisma.membership.findMany({ where: { organizationId: s.org.id, role: "CHEF" }, include: { user: true, employee: { include: { _count: { select: { subordinates: { where: { status: "ACTIVE" } } } } } } } });
  return { items: leads.map((l) => ({ membershipId: l.id, active: l.active, activated: !!l.user.passwordHash, employeeId: l.employeeId, name: `${l.user.firstName} ${l.user.lastName}`, email: l.user.email, position: l.employee?.position ?? null, teamSize: l.employee?._count.subordinates ?? 0, permissions: normalizePermissions(l.permissions) })) };
});

export const POST = route(
  { feature: "employees", rhOnly: true, body: z.object({ employeeId: z.string(), permissions: z.record(z.string(), z.boolean()), memberIds: z.array(z.string()).default([]) }) },
  async ({ s, body, log }) => {
    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, organizationId: s.org.id, status: "ACTIVE" } });
    if (!emp) fail(404, "Salarié introuvable.");
    const permissions = normalizePermissions(body.permissions);
    const acc = await provisionAccess({ organizationId: s.org.id, orgName: s.org.name, employeeId: emp!.id, email: emp!.email, firstName: emp!.firstName, lastName: emp!.lastName, role: "CHEF", permissions });
    const members = body.memberIds.filter((id) => id !== emp!.id);
    if (members.length) await prisma.employee.updateMany({ where: { id: { in: members }, organizationId: s.org.id }, data: { teamLeadId: emp!.id } });
    await log("CREATE", "TEAM_LEAD", emp!.id, { permissions, members: members.length });
    return { ok: true, invited: acc.invited };
  },
);
