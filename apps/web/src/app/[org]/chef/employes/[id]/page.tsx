import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canDo, requirePage } from "@/server/context";
import { loadProfile } from "@/server/profile";
import { EmployeeProfile } from "@/components/employees/employee-profile";

export const metadata: Metadata = { title: "Fiche salarié" };

export default async function ChefEmployeePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const s = await requirePage(org, "chef");
  if (!s.subordinateIds.includes(id)) notFound();
  const data = await loadProfile(s.org.id, id, s.org.timezone);
  if (!data) notFound();
  const canSee = canDo(s, "rates.view", id);
  if (!canSee) Object.assign(data.employee, { hourlyRate: null, netHourlyRate: null, monthlyBase: null });
  return <EmployeeProfile data={data} base={`/${org}/chef`} tz={s.org.timezone} initialTab="infos" canSeeRates={canSee} canEditRates={canDo(s, "rates.edit", id)} />;
}
