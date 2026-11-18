import type { NextRequest } from "next/server";
import { ingestAttlog, prisma } from "@yghr/db";
import { deviceBySn, text } from "@/server/iclock";
import { emit } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";

/** Handshake: the device fetches its push options. */
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  const device = await deviceBySn(sn);
  if (!device) return text("Unknown device", 401);
  await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date() } });
  await emit(device.organizationId, "device:status", { id: device.id, status: "ONLINE" });
  return text([`GET OPTION FROM: ${sn}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=30", "Delay=10", "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog", "TimeZone=1", "Realtime=1", "Encrypt=None"].join("\n"));
}

/** Data upload: table=ATTLOG lines (other tables are acknowledged and ignored). */
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!rateLimit(`iclock:${sn}`, 120, 60_000).ok) return text("Too many requests", 429);
  const device = await deviceBySn(sn);
  if (!device) return text("Unknown device", 401);
  const table = req.nextUrl.searchParams.get("table") ?? "";
  const body = (await req.text()).slice(0, 2_000_000);
  if (table !== "ATTLOG") {
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
    return text(`OK: ${body.split("\n").filter(Boolean).length}`);
  }
  const { lines, created } = await ingestAttlog(prisma, device.id, body);
  for (const p of created) {
    await emit(device.organizationId, "punch:new", { id: p.id, employeeId: p.employeeId, name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : `ID inconnu #${p.deviceUserId}`, at: p.timestamp.toISOString(), device: device.name });
  }
  if (created.length) await emit(device.organizationId, "attendance:update", { count: created.length });
  return text(`OK: ${lines}`);
}
