import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { type Actor, type FeatureKey, normalizePermissions, type Permission, type PermissionSet, can } from "@yghr/core";
import { prisma } from "@yghr/db";
import { ACCESS_COOKIE, verifyAccess } from "./auth";

export type Space = "rh" | "chef" | "salarie";

export interface SessionContext {
  userId: string;
  sessionId: string;
  user: { id: string; email: string; firstName: string; lastName: string; avatarUrl: string | null; totpEnabled: boolean };
  org: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    status: "ACTIVE" | "TRIAL" | "SUSPENDED";
    isDemo: boolean;
    trialEndsAt: string | null;
    /** Suspended, or trial over: the clinic can no longer use the app (the YGHR support still can). */
    blocked: boolean;
    timezone: string;
    currency: string;
    nightStart: string;
    nightEnd: string;
    weeklyRestDay: number | null;
    planName: string;
    features: FeatureKey[];
  };
  membershipId: string;
  role: "SUPER_ADMIN" | "RH" | "CHEF" | "SALARIE";
  employeeId: string | null;
  permissions: PermissionSet;
  /** For team leads: ids of their subordinates (direct reports). */
  subordinateIds: string[];
  orgCount: number;
  actor: Actor;
}

export function spaceForRole(role: string): Space {
  return role === "RH" || role === "SUPER_ADMIN" ? "rh" : role === "CHEF" ? "chef" : "salarie";
}

/** Resolve the authenticated context (memoised per request). Returns null when not logged in. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const jar = await cookies();
  const claims = await verifyAccess(jar.get(ACCESS_COOKIE)?.value);
  if (!claims || !claims.org) return null;
  const session = await prisma.session.findUnique({ where: { id: claims.sid }, select: { revokedAt: true } });
  if (!session || session.revokedAt) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: claims.sub, organizationId: claims.org } },
    include: { user: true, organization: { include: { plan: true } } },
  });
  if (!membership || !membership.active) return null;
  const orgCount = await prisma.membership.count({ where: { userId: claims.sub, active: true } });
  const subordinateIds =
    membership.role === "CHEF" && membership.employeeId
      ? (await prisma.employee.findMany({ where: { organizationId: membership.organizationId, teamLeadId: membership.employeeId, status: "ACTIVE" }, select: { id: true } })).map((e) => e.id)
      : [];
  const permissions = normalizePermissions(membership.permissions);
  const o = membership.organization;
  const u = membership.user;
  return {
    userId: u.id,
    sessionId: claims.sid,
    user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl, totpEnabled: u.totpEnabled },
    org: { id: o.id, slug: o.slug, name: o.name, logoUrl: o.logoUrl, status: o.status, isDemo: o.isDemo, trialEndsAt: o.trialEndsAt?.toISOString() ?? null, blocked: membership.role !== "SUPER_ADMIN" && (o.status === "SUSPENDED" || (o.status === "TRIAL" && !!o.trialEndsAt && o.trialEndsAt < new Date())), timezone: o.timezone, currency: o.currency, nightStart: o.nightStart, nightEnd: o.nightEnd, weeklyRestDay: o.weeklyRestDay, planName: o.plan.name, features: o.plan.features as FeatureKey[] },
    membershipId: membership.id,
    role: membership.role,
    employeeId: membership.employeeId,
    permissions,
    subordinateIds,
    orgCount,
    actor: { role: membership.role, employeeId: membership.employeeId, permissions, subordinateIds },
  };
});

/** For pages: require a session in the given org slug and space, or redirect. */
export async function requirePage(slug: string, space: Space): Promise<SessionContext> {
  const s = await getSession();
  if (!s) {
    const h = await headers();
    const path = h.get("x-yghr-path") ?? `/${slug}/${space}`;
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (s.org.slug !== slug) {
    // Logged into another org: send to the right one if the user is a member of this slug.
    redirect(`/select-org?slug=${encodeURIComponent(slug)}`);
  }
  if (s.org.blocked) redirect("/suspendu");
  const expected = spaceForRole(s.role);
  if (space === "rh" && expected !== "rh") redirect(`/${slug}/${expected}`);
  if (space === "chef" && s.role !== "CHEF") redirect(`/${slug}/${expected}`);
  if (space === "salarie" && !s.employeeId) redirect(`/${slug}/${expected}`);
  return s;
}

export function hasFeature(s: SessionContext, f: FeatureKey): boolean {
  return s.org.features.includes(f);
}

export function canDo(s: SessionContext, p: Permission, targetEmployeeId?: string | null): boolean {
  return can(s.actor, p, targetEmployeeId);
}

/** Employee ids the current user may see (null = whole organisation). */
export function scopeEmployeeIds(s: SessionContext): string[] | null {
  if (s.role === "RH" || s.role === "SUPER_ADMIN") return null;
  if (s.role === "CHEF") return [...s.subordinateIds, ...(s.employeeId ? [s.employeeId] : [])];
  return s.employeeId ? [s.employeeId] : [];
}

export function ensure(cond: unknown): asserts cond {
  if (!cond) notFound();
}
