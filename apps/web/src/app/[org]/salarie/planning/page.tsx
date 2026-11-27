import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { MyPlanning } from "@/components/me/me-views";

export const metadata: Metadata = { title: "Mon planning" };

export default async function MyPlanningPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  return <MyPlanning today={todayIn(s.org.timezone)} />;
}
