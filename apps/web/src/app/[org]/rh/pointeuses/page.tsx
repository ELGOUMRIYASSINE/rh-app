import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { DevicesView } from "@/components/attendance/devices-view";

export const metadata: Metadata = { title: "Pointeuses" };

export default async function DevicesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { org } = await params;
  const { tab } = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "devices", "Pointeuses");
  if (locked) return locked;
  const [o, employees] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: s.org.id }, select: { useServerTimeForPunches: true, punchDedupMinutes: true } }),
    prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return <DevicesView tz={s.org.timezone} initialTab={tab ?? "punches"} useServerTime={o.useServerTimeForPunches} dedupMinutes={o.punchDedupMinutes} employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} />;
}
