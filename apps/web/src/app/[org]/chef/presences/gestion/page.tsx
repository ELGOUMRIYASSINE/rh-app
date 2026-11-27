import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { AttendanceGestion } from "@/components/attendance/attendance-gestion";

export const metadata: Metadata = { title: "Validation des pointages" };

export default async function ChefGestion({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return chefGate(s, "Présences", { feature: "attendance", permission: "attendance.validate" }) ?? <AttendanceGestion today={todayIn(s.org.timezone)} tz={s.org.timezone} back={`/${org}/chef/presences`} />;
}
