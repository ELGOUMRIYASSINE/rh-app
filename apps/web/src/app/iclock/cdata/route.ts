import type { NextRequest } from "next/server";
import { ingestAttlog, ingestUserData, prisma } from "@yghr/db";
import { deviceBySn, deviceUserName, text } from "@/server/iclock";
import { emit } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";

/**
 * Handshake: the device fetches its push options. We ask for attendance logs AND user changes
 * (enrolment, names, fingerprints, faces) so the app always knows who is in the clock.
 */
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  const device = await deviceBySn(sn);
  if (!device) return text("Unknown device", 401);
  await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date() } });
  await emit(device.organizationId, "device:status", { id: device.id, status: "ONLINE" });
  return text([
    `GET OPTION FROM: ${sn}`,
    "ATTLOGStamp=None", "OPERLOGStamp=None", "ATTPHOTOStamp=None",
    "ErrorDelay=30", "Delay=10", "TransTimes=00:00;14:05", "TransInterval=1",
    "TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFACE",
    "TimeZone=1", "Realtime=1", "Encrypt=None",
  ].join("\n"));
}

/** Data upload: ATTLOG (clock-ins) and OPERLOG / USERINFO / BIODATA / FINGERTMP (users, names, credentials). */
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!rateLimit(`iclock:${sn}`, 240, 60_000).ok) return text("Too many requests", 429);
  const device = await deviceBySn(sn);
  if (!device) return text("Unknown device", 401);
  const table = (req.nextUrl.searchParams.get("table") ?? "").toUpperCase();
  const body = (await req.text()).slice(0, 5_000_000);
  if (table === "ATTLOG") {
    const { lines, created } = await ingestAttlog(prisma, device.id, body);
    for (const p of created) {
      await emit(device.organizationId, "punch:new", { id: p.id, employeeId: p.employeeId, name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : await deviceUserName(device.id, p.deviceUserId), at: p.timestamp.toISOString(), device: device.name });
    }
    if (created.length) await emit(device.organizationId, "attendance:update", { count: created.length });
    return text(`OK: ${lines}`);
  }
  if (["OPERLOG", "USERINFO", "BIODATA", "FINGERTMP", "USER"].includes(table)) {
    const r = await ingestUserData(prisma, device.id, body);
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
    if (r.users || r.fingerprints || r.faces) await emit(device.organizationId, "device:users", { id: device.id, ...r });
    return text(`OK: ${r.lines}`);
  }
  // Photos and other tables are acknowledged and ignored.
  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
  return text(`OK: ${body.split("\n").filter(Boolean).length}`);
}
