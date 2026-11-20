import { z } from "zod";
import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";

export const PATCH = platformRoute({ body: z.object({ resolved: z.boolean() }) }, async ({ body, params }) => {
  if (params.id === "all") await prisma.errorEvent.updateMany({ where: { resolved: false }, data: { resolved: body.resolved } });
  else await prisma.errorEvent.update({ where: { id: params.id! }, data: { resolved: body.resolved } });
  return { ok: true };
});
