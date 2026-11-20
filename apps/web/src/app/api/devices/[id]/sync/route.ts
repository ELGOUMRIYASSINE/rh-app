import { z } from "zod";
import { prisma, queueDeviceCommand, syncLanDevice } from "@yghr/db";
import { fail, route } from "@/server/api";
import { deviceUserName } from "@/server/iclock";
import { emit } from "@/server/realtime";

/**
 * LAN: read the device now (identity, users with names, clock-ins). `full` imports the whole history.
 * ADMS: queue the equivalent commands, delivered on the device's next poll (a few seconds).
 */
export const POST = route({ feature: "devices", rhOnly: true, body: z.object({ full: z.boolean().optional() }) }, async ({ s, params, body, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  if (d!.mode === "ADMS") {
    await queueDeviceCommand(prisma, d!.id, "users");
    await queueDeviceCommand(prisma, d!.id, body.full ? "history" : "check");
    await queueDeviceCommand(prisma, d!.id, "info");
    await log("UPDATE", "DEVICE", d!.id, { queued: body.full ? "full" : "sync" });
    return { queued: true };
  }
  try {
    const r = await syncLanDevice(prisma, d!.id, { full: body.full });
    for (const p of r.punches) if (p) await emit(s.org.id, "punch:new", { id: p.id, name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : await deviceUserName(d!.id, p.deviceUserId), at: p.timestamp.toISOString(), device: d!.name });
    await emit(s.org.id, "device:status", { id: d!.id, status: "ONLINE" });
    await log("UPDATE", "DEVICE", d!.id, { sync: { received: r.received, created: r.created, users: r.users, linked: r.linked, full: !!body.full } });
    return { received: r.received, created: r.created, users: r.users, linked: r.linked };
  } catch (e) {
    await emit(s.org.id, "device:status", { id: d!.id, status: "OFFLINE" });
    fail(502, (e as Error).message);
  }
});
