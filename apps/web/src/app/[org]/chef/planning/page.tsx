import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { PlanningView } from "@/components/planning/planning-view";

export const metadata: Metadata = { title: "Planning de l'équipe" };

export default async function ChefPlanning({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return chefGate(s, "Planning", { feature: "planning", permission: "planning.manage" }) ?? <PlanningView today={todayIn(s.org.timezone)} title="Planning de l'équipe" />;
}
