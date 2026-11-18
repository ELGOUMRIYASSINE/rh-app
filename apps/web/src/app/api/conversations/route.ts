import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

export const GET = route({ feature: "messaging", allowEmployee: true }, async ({ s }) => {
  const convs = await prisma.conversation.findMany({
    where: { organizationId: s.org.id, participants: { some: { userId: s.userId } } },
    include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  const out = [];
  for (const c of convs) {
    const me = c.participants.find((p) => p.userId === s.userId);
    const unread = await prisma.message.count({ where: { conversationId: c.id, senderId: { not: s.userId }, ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}) } });
    const others = c.participants.filter((p) => p.userId !== s.userId).map((p) => `${p.user.firstName} ${p.user.lastName}`);
    out.push({ id: c.id, title: c.title ?? others.join(", "), isGroup: c.isGroup, members: c.participants.length, last: c.messages[0] ? { body: c.messages[0].body, at: c.messages[0].createdAt.toISOString(), mine: c.messages[0].senderId === s.userId } : null, unread });
  }
  return { items: out };
});

/** Start a conversation. A 1:1 conversation is reused if it already exists. */
export const POST = route({ feature: "messaging", allowEmployee: true, body: z.object({ userIds: z.array(z.string()).min(1).max(50), title: z.string().trim().max(80).optional() }) }, async ({ s, body }) => {
  const ids = [...new Set(body.userIds.filter((u) => u !== s.userId))];
  const valid = await prisma.membership.count({ where: { organizationId: s.org.id, userId: { in: ids }, active: true } });
  if (valid !== ids.length) fail(400, "Destinataire inconnu.");
  if (ids.length === 1 && !body.title) {
    const existing = await prisma.conversation.findFirst({ where: { organizationId: s.org.id, isGroup: false, AND: [{ participants: { some: { userId: s.userId } } }, { participants: { some: { userId: ids[0] } } }] } });
    if (existing) return { id: existing.id };
  }
  const c = await prisma.conversation.create({ data: { organizationId: s.org.id, isGroup: ids.length > 1 || !!body.title, title: body.title || null, participants: { create: [s.userId, ...ids].map((userId) => ({ userId })) } } });
  return { id: c.id };
});
