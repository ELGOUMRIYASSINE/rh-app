import "server-only";
import { prisma } from "@yghr/db";

/** ADMS devices authenticate by their registered serial number only (no cookie). */
export async function deviceBySn(sn: string | null) {
  if (!sn || !/^[A-Za-z0-9_-]{4,40}$/.test(sn)) return null;
  return prisma.device.findFirst({ where: { serialNumber: sn, mode: "ADMS" } });
}
export const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
