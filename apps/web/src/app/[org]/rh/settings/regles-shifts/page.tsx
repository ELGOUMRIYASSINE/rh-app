import type { Metadata } from "next";
import { prisma, fromDbDate, todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { RulesModule } from "@/components/settings/rules/rules-module";

export const metadata: Metadata = { title: "Règles des shifts" };

export default async function RulesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { org } = await params;
  const { tab } = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "settings", "Règles des shifts");
  if (locked) return locked;
  const O = s.org.id;
  const [rules, shiftTypes, categories, services, coverage, rotations, employees] = await Promise.all([
    prisma.workRule.findMany({ where: { organizationId: O }, orderBy: [{ type: "asc" }] }),
    prisma.shiftType.findMany({ where: { organizationId: O }, orderBy: { startTime: "asc" } }),
    prisma.staffCategory.findMany({ where: { organizationId: O }, orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { status: "ACTIVE" } } } } } }),
    prisma.service.findMany({ where: { organizationId: O }, orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { status: "ACTIVE" } } } } } }),
    prisma.coverageRule.findMany({ where: { organizationId: O }, orderBy: { createdAt: "asc" } }),
    prisma.rotation.findMany({ where: { organizationId: O }, orderBy: { createdAt: "asc" }, include: { assignments: { include: { service: true, employee: true, staffCategory: true } } } }),
    prisma.employee.findMany({ where: { organizationId: O, status: "ACTIVE" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rules.map((r) => r.updatedById).filter(Boolean) as string[])] } }, select: { id: true, firstName: true, lastName: true } });
  return (
    <RulesModule
      base={`/${org}/rh`}
      initialTab={tab ?? "rules"}
      today={todayIn(s.org.timezone)}
      rules={rules.map((r) => ({ id: r.id, type: r.type, staffCategoryId: r.staffCategoryId, value: r.value?.toNumber() ?? null, boolValue: r.boolValue, severity: r.severity, exceptionAllowed: r.exceptionAllowed, active: r.active, updatedAt: r.updatedAt.toISOString(), updatedBy: users.find((u) => u.id === r.updatedById) ?? null }))}
      shiftTypes={shiftTypes.map((t) => ({ id: t.id, name: t.name, code: t.code, color: t.color, startTime: t.startTime, endTime: t.endTime, breakMinutes: t.breakMinutes, breakPaid: t.breakPaid, isNight: t.isNight, staffCategoryId: t.staffCategoryId, active: t.active }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, code: c.code, description: c.description, active: c.active, count: c._count.employees }))}
      services={services.map((c) => ({ id: c.id, name: c.name, active: c.active, count: c._count.employees }))}
      coverage={coverage.map((c) => ({ id: c.id, shiftTypeId: c.shiftTypeId, serviceId: c.serviceId, staffCategoryId: c.staffCategoryId, min: c.min, max: c.max, days: c.days, severity: c.severity, active: c.active, label: c.label }))}
      rotations={rotations.map((r) => ({
        id: r.id, name: r.name, unit: r.unit, sequence: r.sequence as string[], workDays: r.workDays, active: r.active,
        assignments: r.assignments.map((a) => ({ id: a.id, label: a.service ? `Service : ${a.service.name}` : a.employee ? `Salarié : ${a.employee.firstName} ${a.employee.lastName}` : a.staffCategory ? `Catégorie : ${a.staffCategory.name}` : "Toute l'organisation", startDate: fromDbDate(a.startDate), endDate: a.endDate ? fromDbDate(a.endDate) : null })),
      }))}
      employees={employees}
    />
  );
}
