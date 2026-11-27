import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

export const PATCH = route({ feature: "devices", rhOnly: true, body: z.object({ name: z.string().trim().min(1).max(60).optional(), ip: z.string().optional(), port: z.number().int().optional() }) }, async ({ s, params, body, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  const u = await prisma.device.update({ where: { id: d!.id }, data: body });
  await log("UPDATE", "DEVICE", d!.id, body);
  return { item: u };
});

export const DELETE = route({ feature: "devices", rhOnly: true }, async ({ s, params, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  await prisma.device.delete({ where: { id: d!.id } });
  await log("DELETE", "DEVICE", d!.id, { name: d!.name });
  return { ok: true };
});
