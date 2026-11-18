import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { canDo, requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Rapports" };

export default async function ChefReports({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return chefGate(s, "Rapports", { feature: "reports", permission: "reports.view" }) ?? <ReportsView today={todayIn(s.org.timezone)} canExport={canDo(s, "data.export")} />;
}
