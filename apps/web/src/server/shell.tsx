import "server-only";
import { prisma } from "@yghr/db";
import type { FeatureKey, Permission } from "@yghr/core";
import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup } from "@/components/shell/nav";
import { LockedFeature } from "@/components/locked-feature";
import { canDo, type SessionContext, type Space } from "./context";
import { NoPermission } from "@/components/no-permission";
import { logoSrc } from "./branding";

export async function Shell({ s, space, nav, children }: { s: SessionContext; space: Space; nav: NavGroup[]; children: React.ReactNode }) {
  const orgs = s.orgCount > 1 ? (await prisma.membership.findMany({ where: { userId: s.userId, active: true }, include: { organization: true } })).map((m) => ({ id: m.organizationId, name: m.organization.name, slug: m.organization.slug })) : [];
  return (
    <AppShell base={`/${s.org.slug}/${space}`} space={space} nav={nav} features={s.org.features} permissions={s.permissions} role={s.role} user={s.user} org={{ id: s.org.id, name: s.org.name, slug: s.org.slug, planName: s.org.planName, logo: logoSrc(s.org.slug, s.org.logoUrl) }} orgs={orgs}>
      {children}
    </AppShell>
  );
}

/** Returns the LockedFeature screen when the plan does not include the feature. */
export function gate(s: SessionContext, feature: FeatureKey, title: string) {
  return s.org.features.includes(feature) ? null : <LockedFeature title={title} feature={feature} />;
}


/** Team-lead page guard: plan feature + granular permission. */
export function chefGate(s: SessionContext, title: string, opts: { feature?: FeatureKey; permission?: Permission }) {
  if (opts.feature && !s.org.features.includes(opts.feature)) return <LockedFeature title={title} feature={opts.feature} />;
  if (opts.permission && !canDo(s, opts.permission)) return <NoPermission title={title} />;
  return null;
}
