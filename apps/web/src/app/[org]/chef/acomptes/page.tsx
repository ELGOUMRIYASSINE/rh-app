import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { canDo, requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { RequestsModule } from "@/components/premium/requests-module";

export const metadata: Metadata = { title: "Acomptes" };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  const locked = chefGate(s, "Acomptes", { feature: "advances" }); if (locked) return locked;
  void canDo;
  return <RequestsModule mode="advances" selfEmployeeId={s.employeeId} today={todayIn(s.org.timezone)} manage={canDo(s, "advances.validate")} />;
}
