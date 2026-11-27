import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { myOverview } from "@/server/me";
import { MyLeaves } from "@/components/me/me-views";

export const metadata: Metadata = { title: "Mes congés" };

export default async function MyLeavesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "salarie");
  const data = await myOverview(s.org.id, s.employeeId!, s.userId);
  return <MyLeaves data={data} employeeId={s.employeeId!} today={data.today} openNew={sp.new === "1"} />;
}
