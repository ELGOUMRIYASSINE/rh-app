import "server-only";
import { prisma } from "@yghr/db";
import { startSession } from "./auth";
import { audit } from "./audit";
import { spaceForRole } from "./context";

/** After credentials (and 2FA) are verified: pick the organisation, open the session, audit. */
export async function completeLogin(userId: string, persistent: boolean, meta: { ip: string | null; userAgent: string | null }, preferredSlug?: string | null) {
  const memberships = await prisma.membership.findMany({ where: { userId, active: true }, include: { organization: true } });
  const chosen = memberships.find((m) => m.organization.slug === preferredSlug) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const persistentAllowed = chosen ? chosen.organization.persistentSessions : true;
  await startSession({ userId, organizationId: chosen?.organizationId ?? null, persistent: persistent && persistentAllowed, ...meta });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await audit({ organizationId: chosen?.organizationId ?? memberships[0]?.organizationId ?? null, userId, action: "LOGIN", entity: "USER", entityId: userId, ip: meta.ip, userAgent: meta.userAgent });
  if (!chosen) return "/select-org";
  return `/${chosen.organization.slug}/${spaceForRole(chosen.role)}`;
}
