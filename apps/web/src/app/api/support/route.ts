import { z } from "zod";
import { prisma } from "@yghr/db";
import { route } from "@/server/api";
import { notifyPlatform } from "@/server/support";

/** Clinic side: open a support request with the YGHR team. */
export const POST = route(
  { rhOnly: true, body: z.object({ subject: z.string().trim().min(3, "Sujet trop court").max(160), category: z.enum(["question", "bug", "payroll", "devices", "account", "billing", "other"]), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), body: z.string().trim().min(5, "Décrivez votre demande").max(10000) }) },
  async ({ s, body, log }) => {
    const t = await prisma.supportTicket.create({
      data: { organizationId: s.org.id, createdById: s.userId, subject: body.subject, category: body.category, priority: body.priority, messages: { create: { authorId: s.userId, body: body.body } } },
    });
    await log("CREATE", "SUPPORT_TICKET", t.id, { subject: t.subject });
    void notifyPlatform(t.id, "new");
    return { id: t.id };
  },
);
