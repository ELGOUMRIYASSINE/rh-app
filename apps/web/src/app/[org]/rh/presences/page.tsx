import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { PresenceBoard } from "@/components/attendance/presence-board";

export const metadata: Metadata = { title: "Présences" };

export default async function PresencesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "attendance", "Présences");
  if (locked) return locked;
  return <PresenceBoard today={todayIn(s.org.timezone)} tz={s.org.timezone} gestionHref={`/${org}/rh/presences/gestion`} />;
}
