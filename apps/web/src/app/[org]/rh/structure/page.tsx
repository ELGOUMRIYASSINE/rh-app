import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { StructureView } from "@/components/premium/structure-tablets";

export const metadata: Metadata = { title: "Structure" };

export default async function StructurePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "structure", "Gestion de la structure");
  if (locked) return locked;
  const centres = await prisma.centre.findMany({ where: { organizationId: s.org.id }, orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { status: "ACTIVE" } }, services: true } } } });
  const [employees, services] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, centreId: true, position: true, service: { select: { name: true } } } }),
    prisma.service.findMany({ where: { organizationId: s.org.id, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, centreId: true } }),
  ]);
  return (
    <StructureView
      centres={centres.map((c) => ({ id: c.id, name: c.name, address: c.address, active: c.active, employees: c._count.employees, services: c._count.services }))}
      employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, detail: [e.position, e.service?.name].filter(Boolean).join(" · "), centreId: e.centreId }))}
      services={services}
    />
  );
}
