import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { TabletsView } from "@/components/premium/structure-tablets";

export const metadata: Metadata = { title: "Tablettes" };

export default async function TabletsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "tablets", "Tablettes de pointage");
  if (locked) return locked;
  const [tablets, centres, employees, o] = await Promise.all([
    prisma.tablet.findMany({ where: { organizationId: s.org.id }, include: { centre: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.centre.findMany({ where: { organizationId: s.org.id, active: true }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, kioskPin: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: s.org.id } }),
  ]);
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const r = (o.tabletRules ?? {}) as { allowedIps?: string[]; photoRequired?: boolean; geofence?: { lat: number; lng: number; radiusMeters: number } | null };
  return (
    <TabletsView
      slug={org}
      origin={origin}
      tablets={tablets.map((t) => ({ id: t.id, name: t.name, token: t.token, active: t.active, centreId: t.centreId, centre: t.centre, lastSeenAt: t.lastSeenAt?.toISOString() ?? null }))}
      centres={centres}
      employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}`, hasPin: !!e.kioskPin }))}
      rules={{ allowedIps: r.allowedIps ?? [], photoRequired: !!r.photoRequired, geofence: r.geofence ?? null }}
    />
  );
}
