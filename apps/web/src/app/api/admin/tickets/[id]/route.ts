import { z } from "zod";
import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";
import { notifyClinic } from "@/server/support";
import { notify } from "@/server/realtime";

export const PATCH = platformRoute(
  { body: z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CLINIC", "RESOLVED"]).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional() }) },
  async ({ body, params, log }) => {
    const t = await prisma.supportTicket.findUnique({ where: { id: params.id! } });
    if (!t) fail(404, "Demande introuvable.");
    await prisma.supportTicket.update({ where: { id: t!.id }, data: { ...body, ...(body.status === "RESOLVED" ? { resolvedAt: new Date() } : body.status ? { resolvedAt: null } : {}) } });
    await log(t!.organizationId, "UPDATE", "SUPPORT_TICKET", t!.id, body);
    return { ok: true };
  },
);

/** Reply to a clinic. */
export const POST = platformRoute({ body: z.object({ body: z.string().trim().min(1, "Message vide").max(10000), resolve: z.boolean().optional() }) }, async ({ body, params, admin, log }) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: params.id! }, include: { organization: { select: { slug: true } } } });
  if (!t) fail(404, "Demande introuvable.");
  await prisma.supportMessage.create({ data: { ticketId: t!.id, authorId: admin.id, fromPlatform: true, body: body.body } });
  await prisma.supportTicket.update({ where: { id: t!.id }, data: { lastFromPlatform: true, status: body.resolve ? "RESOLVED" : "WAITING_CLINIC", resolvedAt: body.resolve ? new Date() : null } });
  await log(t!.organizationId, "UPDATE", "SUPPORT_TICKET", t!.id, { reply: true });
  if (t!.createdById) await notify(t!.organizationId, [t!.createdById], { type: "support", title: "Réponse du support YGHR", body: t!.subject, link: `/${t!.organization.slug}/rh/support?t=${t!.id}` }).catch(() => {});
  void notifyClinic(t!.id);
  return { ok: true };
});
