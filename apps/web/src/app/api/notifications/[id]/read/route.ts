import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const PATCH = route({ allowEmployee: true }, async ({ s, params }) => {
  await prisma.notification.updateMany({ where: { id: params.id, userId: s.userId, organizationId: s.org.id }, data: { readAt: new Date() } });
  return { ok: true };
});
