import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { setAuthCookies } from "@/server/auth";

/** Leave support mode: deactivate the SUPER_ADMIN memberships and go back to the console. */
export const POST = platformRoute({}, async ({ admin }) => {
  await prisma.membership.updateMany({ where: { userId: admin.id, role: "SUPER_ADMIN" }, data: { active: false } });
  const session = await prisma.session.update({ where: { id: admin.sessionId }, data: { organizationId: null } });
  await setAuthCookies({ userId: admin.id, sessionId: session.id, organizationId: null, persistent: true, expiresAt: session.expiresAt });
  return { redirect: "/admin" };
});
