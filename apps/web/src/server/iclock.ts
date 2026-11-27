import "server-only";
import { prisma } from "@yghr/db";

/** ADMS devices authenticate by their registered serial number only (no cookie). */
export async function deviceBySn(sn: string | null) {
  if (!sn || !/^[A-Za-z0-9_-]{4,40}$/.test(sn)) return null;
  return prisma.device.findFirst({ where: { serialNumber: sn, mode: "ADMS" } });
}
export const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Label for an unlinked fingerprint ID: the name stored in the clock when known. */
export async function deviceUserName(deviceId: string | null, pin: string | null) {
  if (!pin) return "ID inconnu";
  const u = deviceId ? await prisma.deviceUser.findUnique({ where: { deviceId_deviceUserId: { deviceId, deviceUserId: pin } }, select: { name: true } }) : null;
  return u?.name ? `${u.name} (ID #${pin}, non associé)` : `ID inconnu #${pin}`;
}
