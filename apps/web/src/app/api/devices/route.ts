import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

export const GET = route({ feature: "devices", rhOnly: true }, async ({ s }) => ({
  items: await prisma.device.findMany({ where: { organizationId: s.org.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { punches: true } } } }),
  admsHost: process.env.ADMS_PUBLIC_HOST ?? "localhost",
  admsPort: Number(process.env.ADMS_PUBLIC_PORT ?? 3000),
}));

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("LAN"), name: z.string().trim().min(1, "Nom requis").max(60), ip: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+$/i, "Adresse IP invalide"), port: z.number().int().min(1).max(65535).default(4370), commPassword: z.string().max(20).nullable().optional(), serialNumber: z.string().max(40).nullable().optional(), model: z.string().max(80).nullable().optional(), firmware: z.string().max(80).nullable().optional(), userCount: z.number().int().nullable().optional() }),
  z.object({ mode: z.literal("ADMS"), serialNumber: z.string().trim().regex(/^[A-Za-z0-9_-]{4,40}$/, "Numéro de série invalide"), name: z.string().trim().max(60).optional() }),
]);

export const POST = route({ feature: "devices", rhOnly: true, body: Body }, async ({ s, body, log }) => {
  if (body.serialNumber && (await prisma.device.findUnique({ where: { serialNumber: body.serialNumber } }))) fail(409, "Une pointeuse avec ce numéro de série est déjà enregistrée.");
  const d = await prisma.device.create({
    data: body.mode === "LAN"
      ? { organizationId: s.org.id, mode: "LAN", name: body.name, ip: body.ip, port: body.port, commPassword: body.commPassword ?? null, serialNumber: body.serialNumber || null, model: body.model ?? null, firmware: body.firmware ?? null, userCount: body.userCount ?? null, status: "ONLINE", lastSeenAt: new Date() }
      : { organizationId: s.org.id, mode: "ADMS", name: body.name || `Pointeuse ${body.serialNumber}`, serialNumber: body.serialNumber, status: "UNKNOWN" },
  });
  await log("CREATE", "DEVICE", d.id, { name: d.name, mode: d.mode, ip: d.ip, sn: d.serialNumber });
  return { item: d };
});
