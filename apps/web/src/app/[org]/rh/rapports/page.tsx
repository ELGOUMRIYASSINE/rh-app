import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Rapports" };

export default async function ReportsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "reports", "Rapports");
  if (locked) return locked;
  return <ReportsView today={todayIn(s.org.timezone)} canExport />;
}
