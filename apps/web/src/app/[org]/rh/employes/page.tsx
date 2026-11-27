import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { employeeListData } from "@/server/employee-list";
import { EmployeesView } from "@/components/employees/employees-view";

export const metadata: Metadata = { title: "Salariés" };

export default async function EmployeesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string; tab?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "employees", "Salariés");
  if (locked) return locked;
  const data = await employeeListData(s.org.id, null);
  return <EmployeesView {...data} base={`/${org}/rh`} openNew={sp.new === "1"} initialTab={sp.tab === "leads" ? "leads" : "employees"} space="rh" accounts={s.org.features.includes("employee_accounts")} />;
}
