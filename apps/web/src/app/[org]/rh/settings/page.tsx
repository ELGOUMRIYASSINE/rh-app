import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "settings", "Paramètres");
  if (locked) return locked;
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: s.org.id } });
  const [rules, shifts] = await Promise.all([prisma.workRule.count({ where: { organizationId: o.id, active: true } }), prisma.shiftType.count({ where: { organizationId: o.id, active: true } })]);
  return (
    <SettingsView
      base={`/${org}/rh`}
      counts={{ rules, shifts }}
      org={{ name: o.name, slug: o.slug, contactEmail: o.contactEmail ?? "", accountingEmail: o.accountingEmail ?? "", address: o.address ?? "", phone: o.phone ?? "", ice: o.ice ?? "", cnssEmployerNumber: o.cnssEmployerNumber ?? "", logoUrl: o.logoUrl, language: o.language, currency: o.currency, timezone: o.timezone, nightStart: o.nightStart, nightEnd: o.nightEnd, weeklyRestDay: o.weeklyRestDay, useServerTimeForPunches: o.useServerTimeForPunches, require2FAForAdmins: o.require2FAForAdmins, dailyEmails: o.dailyEmails, persistentSessions: o.persistentSessions }}
    />
  );
}
