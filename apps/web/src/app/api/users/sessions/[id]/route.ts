import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const DELETE = route({ allowEmployee: true }, async ({ s, params, log }) => {
  await prisma.session.updateMany({ where: { id: params.id, userId: s.userId }, data: { revokedAt: new Date() } });
  await log("LOGOUT", "SESSION", params.id, { revokedBy: "user" });
  return { ok: true };
});
