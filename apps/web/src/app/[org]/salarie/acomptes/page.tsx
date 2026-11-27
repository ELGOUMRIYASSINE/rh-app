import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { canDo, requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { RequestsModule } from "@/components/premium/requests-module";

export const metadata: Metadata = { title: "Acomptes" };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  const locked = gate(s, "advances", "Acomptes"); if (locked) return locked;
  void canDo;
  return <RequestsModule mode="advances" selfEmployeeId={s.employeeId} today={todayIn(s.org.timezone)} manage={false} />;
}
