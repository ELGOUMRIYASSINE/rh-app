import type { Metadata } from "next";
import { requirePage, scopeEmployeeIds } from "@/server/context";
import { dashboardStats } from "@/server/dashboard";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function ChefHome({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  const stats = await dashboardStats(s.org.id, { employeeIds: scopeEmployeeIds(s) ?? [] });
  return <Dashboard initial={stats} base={`/${org}/chef`} firstName={s.user.firstName} space="chef" />;
}
