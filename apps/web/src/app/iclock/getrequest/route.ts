import type { NextRequest } from "next/server";
import { prisma } from "@yghr/db";
import { deviceBySn, text } from "@/server/iclock";

/** Heartbeat / command polling. No pending commands: answer OK. */
export async function GET(req: NextRequest) {
  const device = await deviceBySn(req.nextUrl.searchParams.get("SN"));
  if (!device) return text("Unknown device", 401);
  await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date() } });
  return text("OK");
}
