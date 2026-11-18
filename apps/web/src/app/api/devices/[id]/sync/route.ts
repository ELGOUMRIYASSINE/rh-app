import { prisma, syncLanDevice } from "@yghr/db";
import { fail, route } from "@/server/api";
import { emit } from "@/server/realtime";

export const POST = route({ feature: "devices", rhOnly: true }, async ({ s, params, log }) => {
  const d = await prisma.device.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!d) fail(404, "Pointeuse introuvable.");
  if (d!.mode !== "LAN") fail(400, "Les pointeuses ADMS envoient leurs pointages automatiquement.");
  try {
    const r = await syncLanDevice(prisma, d!.id);
    for (const p of r.punches) if (p) await emit(s.org.id, "punch:new", { id: p.id, name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : `ID inconnu #${p.deviceUserId}`, at: p.timestamp.toISOString(), device: d!.name });
    await emit(s.org.id, "device:status", { id: d!.id, status: "ONLINE" });
    await log("UPDATE", "DEVICE", d!.id, { sync: { received: r.received, created: r.created } });
    return { received: r.received, created: r.created };
  } catch (e) {
    await emit(s.org.id, "device:status", { id: d!.id, status: "OFFLINE" });
    fail(502, (e as Error).message);
  }
});
