import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const GET = route({ allowEmployee: true }, async ({ s }) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { organizationId: s.org.id, userId: s.userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { organizationId: s.org.id, userId: s.userId, readAt: null } }),
  ]);
  return { items, unread };
});

/** Mark all as read. */
export const PATCH = route({ allowEmployee: true }, async ({ s }) => {
  await prisma.notification.updateMany({ where: { organizationId: s.org.id, userId: s.userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
});
