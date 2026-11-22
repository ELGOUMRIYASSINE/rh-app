import { logoSrc } from "@/server/branding";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@yghr/db";
import { effectiveFeatures } from "@yghr/core";
import { Kiosk } from "@/components/premium/kiosk";

export const metadata: Metadata = { title: "Borne de pointage" };

export default async function KioskPage({ params }: { params: Promise<{ org: string; token: string }> }) {
  const { org, token } = await params;
  const t = await prisma.tablet.findUnique({ where: { token }, include: { organization: true, centre: true } });
  if (!t || !t.active || t.organization.slug !== org) notFound();
  const plan = await prisma.plan.findUnique({ where: { id: t.organization.planId } });
  if (!plan || !effectiveFeatures(plan.features, t.organization.featureOverrides).includes("tablets")) notFound();
  const rules = (t.organization.tabletRules ?? {}) as { photoRequired?: boolean; geofence?: unknown };
  return <Kiosk token={token} orgName={t.organization.name} logo={logoSrc(t.organization.slug, t.organization.logoUrl)} place={t.centre?.name ?? t.name} timezone={t.organization.timezone} photoRequired={!!rules.photoRequired} geofence={!!rules.geofence} />;
}
