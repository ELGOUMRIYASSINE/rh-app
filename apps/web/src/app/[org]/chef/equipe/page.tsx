import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { employeeListData } from "@/server/employee-list";
import { EmployeesView } from "@/components/employees/employees-view";

export const metadata: Metadata = { title: "Mon équipe" };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "chef");
  const data = await employeeListData(s.org.id, s.subordinateIds);
  return <EmployeesView {...data} base={`/${org}/chef`} openNew={sp.new === "1" && !!s.permissions["team.add"]} initialTab="employees" space="chef" />;
}
