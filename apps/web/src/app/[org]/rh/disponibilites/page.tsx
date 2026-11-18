import type { Metadata } from "next";
import { prisma, todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { AvailabilityGrid } from "@/components/premium/availability";

export const metadata: Metadata = { title: "Disponibilités" };

export default async function AvailabilityPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "availability", "Disponibilités");
  if (locked) return locked;
  const employees = await prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } });
  return <AvailabilityGrid employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} today={todayIn(s.org.timezone)} />;
}
