import { z } from "zod";
import { prisma } from "@yghr/db";
import { hashPassword, passwordIssues, verifyPassword } from "@/server/auth";
import { fail, route } from "@/server/api";

export const POST = route(
  { allowEmployee: true, body: z.object({ current: z.string().min(1, "Mot de passe actuel requis"), next: z.string(), confirm: z.string() }) },
  async ({ s, body, log }) => {
    if (body.next !== body.confirm) fail(400, "Les deux mots de passe ne correspondent pas.");
    const issue = passwordIssues(body.next);
    if (issue) fail(400, issue);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, body.current))) fail(400, "Mot de passe actuel incorrect.");
    await prisma.user.update({ where: { id: s.userId }, data: { passwordHash: await hashPassword(body.next) } });
    await prisma.session.updateMany({ where: { userId: s.userId, id: { not: s.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await log("UPDATE", "USER", s.userId, { field: "password" });
    return { ok: true, message: "Mot de passe modifié. Vos autres sessions ont été déconnectées." };
  },
);
