import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { loadProfile } from "@/server/profile";
import { EmployeeProfile } from "@/components/employees/employee-profile";

export const metadata: Metadata = { title: "Fiche salarié" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ edit?: string; tab?: string }> }) {
  const { org, id } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "employees", "Salariés");
  if (locked) return locked;
  const data = await loadProfile(s.org.id, id, s.org.timezone);
  if (!data) notFound();
  return <EmployeeProfile data={data} base={`/${org}/rh`} tz={s.org.timezone} edit={sp.edit === "1"} initialTab={sp.tab ?? "infos"} canSeeRates canEditRates />;
}
