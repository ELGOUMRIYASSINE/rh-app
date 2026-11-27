import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { PresenceBoard } from "@/components/attendance/presence-board";

export const metadata: Metadata = { title: "Présences" };

export default async function ChefPresences({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return chefGate(s, "Présences", { feature: "attendance", permission: "attendance.validate" }) ?? <PresenceBoard today={todayIn(s.org.timezone)} tz={s.org.timezone} gestionHref={`/${org}/chef/presences/gestion`} />;
}
