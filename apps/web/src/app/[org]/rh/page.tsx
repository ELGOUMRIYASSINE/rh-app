import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { dashboardStats } from "@/server/dashboard";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function RhDashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "dashboard", "Tableau de bord");
  if (locked) return locked;
  const stats = await dashboardStats(s.org.id);
  return <Dashboard initial={stats} base={`/${org}/rh`} firstName={s.user.firstName} space="rh" />;
}
