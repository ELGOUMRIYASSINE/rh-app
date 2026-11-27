import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { AuditView } from "@/components/audit/audit-view";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function LogsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "audit", "Audit Logs");
  if (locked) return locked;
  return <AuditView tz={s.org.timezone} />;
}
