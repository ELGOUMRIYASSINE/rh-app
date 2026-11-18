import type { Metadata } from "next";
import { prisma, todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { LeavesView } from "@/components/leaves/leaves-view";

export const metadata: Metadata = { title: "Congés" };

export default async function LeavesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string; employee?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "leaves", "Congés");
  if (locked) return locked;
  const employees = await prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } });
  return <LeavesView employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} selfEmployeeId={s.employeeId} today={todayIn(s.org.timezone)} openNew={sp.new === "1"} defaultEmployeeId={sp.employee ?? null} canEditPolicy />;
}
