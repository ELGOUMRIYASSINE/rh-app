import type { NextRequest } from "next/server";
import { ingestDeviceInfo, prisma, queueDeviceCommand, takePendingCommands } from "@yghr/db";
import { deviceBySn, text } from "@/server/iclock";

/**
 * Heartbeat / command polling. The device reports its INFO (firmware, users, fingerprints, logs, IP…)
 * and receives the commands queued from the app ("C:<id>:<command>"), or "OK".
 */
export async function GET(req: NextRequest) {
  const device = await deviceBySn(req.nextUrl.searchParams.get("SN"));
  if (!device) return text("Unknown device", 401);
  await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date() } });
  const info = req.nextUrl.searchParams.get("INFO");
  if (info) await ingestDeviceInfo(prisma, device.id, info).catch(() => {});
  // First contact: ask the device for its users (names) automatically.
  if (!device.usersSyncedAt) await queueDeviceCommand(prisma, device.id, "users");
  const cmds = await takePendingCommands(prisma, device.id);
  return text(cmds.length ? cmds.join("\n") : "OK");
}
