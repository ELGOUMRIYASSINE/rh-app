import { z } from "zod";
import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";

/** Enable / disable an account in a clinic, or reset its two-factor authentication. */
export const PATCH = platformRoute({ body: z.object({ active: z.boolean().optional(), reset2fa: z.boolean().optional() }) }, async ({ body, params, log }) => {
  const m = await prisma.membership.findUnique({ where: { id: params.id! }, include: { user: true } });
  if (!m) fail(404, "Compte introuvable.");
  if (body.active !== undefined) await prisma.membership.update({ where: { id: m!.id }, data: { active: body.active } });
  if (body.reset2fa) await prisma.user.update({ where: { id: m!.userId }, data: { totpEnabled: false, totpSecret: null } });
  await log(m!.organizationId, "UPDATE", "MEMBERSHIP", m!.userId, { email: m!.user.email, ...body });
  return { ok: true };
});
