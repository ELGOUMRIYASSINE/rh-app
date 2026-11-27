import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { notifyPlatform } from "@/server/support";

/** Clinic side: reply to a request (reopens it), or mark it resolved. */
export const POST = route({ rhOnly: true, body: z.object({ body: z.string().trim().max(10000).optional(), resolve: z.boolean().optional() }) }, async ({ s, body, params, log }) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: params.id!, organizationId: s.org.id } });
  if (!t) fail(404, "Demande introuvable.");
  if (body.body) {
    await prisma.supportMessage.create({ data: { ticketId: t!.id, authorId: s.userId, body: body.body } });
    await prisma.supportTicket.update({ where: { id: t!.id }, data: { lastFromPlatform: false, status: body.resolve ? "RESOLVED" : "OPEN", resolvedAt: body.resolve ? new Date() : null } });
    void notifyPlatform(t!.id, "reply");
  } else if (body.resolve) {
    await prisma.supportTicket.update({ where: { id: t!.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  } else fail(400, "Message vide.");
  await log("UPDATE", "SUPPORT_TICKET", t!.id, { reply: !!body.body, resolve: !!body.resolve });
  return { ok: true };
});
