import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const GET = route({ permission: "settings.manage" }, async ({ s }) => {
  const items = await prisma.ruleChangeLog.findMany({ where: { organizationId: s.org.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])] } }, select: { id: true, firstName: true, lastName: true } });
  return { items: items.map((i) => ({ ...i, user: users.find((u) => u.id === i.userId) ?? null })) };
});
