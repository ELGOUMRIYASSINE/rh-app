import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { AttendanceGestion } from "@/components/attendance/attendance-gestion";

export const metadata: Metadata = { title: "Validation des pointages" };

export default async function GestionPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "attendance", "Présences");
  if (locked) return locked;
  return <AttendanceGestion today={todayIn(s.org.timezone)} tz={s.org.timezone} back={`/${org}/rh/presences`} />;
}
