import "server-only";
import { prisma } from "@yghr/db";
import { normalizePermissions } from "@yghr/core";

export async function employeeListData(organizationId: string, scope: string[] | null) {
  const [employees, services, categories, leads] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId, ...(scope ? { id: { in: scope } } : {}) },
      orderBy: [{ status: "asc" }, { lastName: "asc" }],
      include: { teamLead: { select: { id: true, firstName: true, lastName: true } }, service: { select: { name: true } }, staffCategory: { select: { name: true } }, membership: { select: { role: true, user: { select: { passwordHash: true, lastLoginAt: true } } } } },
    }),
    prisma.service.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.staffCategory.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    scope ? Promise.resolve([]) : prisma.membership.findMany({ where: { organizationId, role: "CHEF" }, include: { user: true, employee: { include: { _count: { select: { subordinates: { where: { status: "ACTIVE" } } } } } } } }),
  ]);
  return {
    employees: employees.map((e) => ({
      id: e.id, firstName: e.firstName, lastName: e.lastName, matricule: e.matricule, email: e.email, phone: e.phone, position: e.position,
      service: e.service?.name ?? null, serviceId: e.serviceId, category: e.staffCategory?.name ?? null, staffCategoryId: e.staffCategoryId,
      teamLead: e.teamLead ? `${e.teamLead.firstName} ${e.teamLead.lastName}` : null, teamLeadId: e.teamLeadId,
      contractType: e.contractType, weeklyHours: e.weeklyHours?.toNumber() ?? null, status: e.status,
      access: !e.membership ? "none" : e.membership.user.passwordHash ? "active" : "invited",
      isLead: e.membership?.role === "CHEF",
    })),
    services,
    categories,
    leads: leads.map((l) => ({ membershipId: l.id, active: l.active, activated: !!l.user.passwordHash, employeeId: l.employeeId, name: `${l.user.firstName} ${l.user.lastName}`, email: l.user.email, position: l.employee?.position ?? null, teamSize: l.employee?._count.subordinates ?? 0, permissions: normalizePermissions(l.permissions) })),
  };
}
export type EmployeeListData = Awaited<ReturnType<typeof employeeListData>>;
