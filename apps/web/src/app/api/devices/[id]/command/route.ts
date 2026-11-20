import { z } from "zod";
import { ADMS_COMMANDS, prisma, queueDeviceCommand } from "@yghr/db";
import { fail, route } from "@/server/api";

/** Queue a command for an ADMS device (users, full history, info, reboot). */
export const POST = route({ feature: "devices", rhOnly: true, body: z.object({ kind: z.enum(Object.keys(ADMS_COMMANDS) as [keyof typeof ADMS_COMMANDS, ...(keyof typeof ADMS_COMMANDS)[]]) }) }, async ({ s, params, body, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  if (d!.mode !== "ADMS") fail(400, "Les commandes à distance concernent les pointeuses ADMS. Pour une pointeuse LAN, utilisez Synchroniser.");
  const c = await queueDeviceCommand(prisma, d!.id, body.kind);
  await log("UPDATE", "DEVICE", d!.id, { command: body.kind });
  return { id: c.id, label: c.label };
});
