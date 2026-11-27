import type { Metadata } from "next";
import { prisma, todayIn } from "@yghr/db";
import { canDo, requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { LeavesView } from "@/components/leaves/leaves-view";

export const metadata: Metadata = { title: "Congés" };

export default async function ChefLeaves({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "chef");
  const locked = chefGate(s, "Congés", { feature: "leaves" });
  if (locked) return locked;
  const team = canDo(s, "leaves.approve") ? await prisma.employee.findMany({ where: { id: { in: s.subordinateIds } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }) : [];
  return <LeavesView employees={team.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} selfEmployeeId={s.employeeId} today={todayIn(s.org.timezone)} openNew={sp.new === "1"} canEditPolicy={false} />;
}
