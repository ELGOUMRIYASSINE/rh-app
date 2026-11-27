import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { MyAvailability } from "@/components/premium/availability";

export const metadata: Metadata = { title: "Mes disponibilités" };

export default async function MyAvailabilityPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  return gate(s, "availability", "Disponibilités") ?? <MyAvailability employeeId={s.employeeId!} today={todayIn(s.org.timezone)} />;
}
