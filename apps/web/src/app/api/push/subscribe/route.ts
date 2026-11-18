import { z } from "zod";
import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const POST = route({ allowEmployee: true, body: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) }, async ({ s, body }) => {
  await prisma.pushSubscription.upsert({ where: { endpoint: body.endpoint }, create: { userId: s.userId, endpoint: body.endpoint, keys: body.keys }, update: { userId: s.userId, keys: body.keys } });
  return { ok: true };
});
export const DELETE = route({ allowEmployee: true, body: z.object({ endpoint: z.string() }) }, async ({ s, body }) => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: s.userId } });
  return { ok: true };
});
