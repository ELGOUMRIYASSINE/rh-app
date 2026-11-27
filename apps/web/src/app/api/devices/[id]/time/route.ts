import { prisma, setDeviceTime } from "@yghr/db";
import { fail, route } from "@/server/api";

export const POST = route({ feature: "devices", rhOnly: true }, async ({ s, params, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  try {
    await setDeviceTime(prisma, d!.id);
  } catch (e) {
    fail(502, (e as Error).message);
  }
  await log("UPDATE", "DEVICE", d!.id, { setTime: true });
  return { ok: true };
});
