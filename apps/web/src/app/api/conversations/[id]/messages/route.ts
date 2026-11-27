import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { emit } from "@/server/realtime";

async function member(convId: string, orgId: string, userId: string) {
  const c = await prisma.conversation.findFirst({ where: { id: convId, organizationId: orgId, participants: { some: { userId } } }, include: { participants: true } });
  if (!c) fail(404, "Conversation introuvable.");
  return c!;
}

export const GET = route({ feature: "messaging", allowEmployee: true }, async ({ s, params }) => {
  const c = await member(params.id!, s.org.id, s.userId);
  const msgs = await prisma.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "asc" }, take: 300, include: { sender: { select: { id: true, firstName: true, lastName: true } } } });
  await prisma.conversationParticipant.updateMany({ where: { conversationId: c.id, userId: s.userId }, data: { lastReadAt: new Date() } });
  return { items: msgs.map((m) => ({ id: m.id, body: m.body, at: m.createdAt.toISOString(), mine: m.senderId === s.userId, sender: `${m.sender.firstName} ${m.sender.lastName}` })) };
});

export const POST = route({ feature: "messaging", allowEmployee: true, body: z.object({ body: z.string().trim().min(1).max(4000) }) }, async ({ s, params, body }) => {
  const c = await member(params.id!, s.org.id, s.userId);
  const m = await prisma.message.create({ data: { conversationId: c.id, senderId: s.userId, body: body.body } });
  await prisma.conversation.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
  await prisma.conversationParticipant.updateMany({ where: { conversationId: c.id, userId: s.userId }, data: { lastReadAt: new Date() } });
  for (const p of c.participants) if (p.userId !== s.userId) await emit(s.org.id, "message:new", { conversationId: c.id, from: `${s.user.firstName} ${s.user.lastName}`, body: body.body.slice(0, 120) }, p.userId);
  return { id: m.id };
});
