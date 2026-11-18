import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { PlanningView } from "@/components/planning/planning-view";

export const metadata: Metadata = { title: "Planning" };

export default async function PlanningPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "planning", "Planning");
  if (locked) return locked;
  return <PlanningView today={todayIn(s.org.timezone)} />;
}
