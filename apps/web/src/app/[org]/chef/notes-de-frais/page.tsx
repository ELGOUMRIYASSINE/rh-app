import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { canDo, requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { RequestsModule } from "@/components/premium/requests-module";

export const metadata: Metadata = { title: "Notes de frais" };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  const locked = chefGate(s, "Notes de frais", { feature: "expenses" }); if (locked) return locked;
  void canDo;
  return <RequestsModule mode="expenses" selfEmployeeId={s.employeeId} today={todayIn(s.org.timezone)} manage={canDo(s, "expenses.validate")} />;
}
