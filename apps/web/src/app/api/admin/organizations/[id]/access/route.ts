import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";
import { setAuthCookies } from "@/server/auth";

/**
 * Support access: open the clinic's RH space as "Admin YGHR". Creates (or reactivates) a SUPER_ADMIN
 * membership, switches the session to that clinic, and records it in the clinic's audit log.
 */
export const POST = platformRoute({}, async ({ params, admin, log }) => {
  const org = await prisma.organization.findUnique({ where: { id: params.id! } });
  if (!org) fail(404, "Clinique introuvable.");
  const existing = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: admin.id, organizationId: org!.id } } });
  if (existing && existing.role !== "SUPER_ADMIN") {
    await prisma.membership.update({ where: { id: existing.id }, data: { active: true } });
  } else if (existing) {
    await prisma.membership.update({ where: { id: existing.id }, data: { active: true } });
  } else {
    await prisma.membership.create({ data: { userId: admin.id, organizationId: org!.id, role: "SUPER_ADMIN" } });
  }
  const session = await prisma.session.update({ where: { id: admin.sessionId }, data: { organizationId: org!.id } });
  await setAuthCookies({ userId: admin.id, sessionId: session.id, organizationId: org!.id, persistent: true, expiresAt: session.expiresAt });
  await log(org!.id, "SUPPORT_ACCESS", "ORGANIZATION", org!.id, { name: org!.name });
  return { redirect: `/${org!.slug}/${existing && existing.role !== "SUPER_ADMIN" ? (existing.role === "RH" ? "rh" : existing.role === "CHEF" ? "chef" : "salarie") : "rh"}` };
});
