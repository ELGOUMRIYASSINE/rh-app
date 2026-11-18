import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const GET = route({ allowEmployee: true, feature: "messaging" }, async ({ s }) => {
  const parts = await prisma.conversationParticipant.findMany({ where: { userId: s.userId, conversation: { organizationId: s.org.id } }, select: { conversationId: true, lastReadAt: true } });
  let count = 0;
  for (const p of parts) {
    count += await prisma.message.count({ where: { conversationId: p.conversationId, senderId: { not: s.userId }, ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}) } });
  }
  return { count };
});
