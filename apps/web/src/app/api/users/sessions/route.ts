import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const GET = route({ allowEmployee: true }, async ({ s }) => {
  const items = await prisma.session.findMany({ where: { userId: s.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" } });
  return { items: items.map((x) => ({ id: x.id, ip: x.ip, userAgent: x.userAgent, createdAt: x.createdAt.toISOString(), lastUsedAt: x.lastUsedAt.toISOString(), current: x.id === s.sessionId })) };
});
