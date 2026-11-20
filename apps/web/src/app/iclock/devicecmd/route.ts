import type { NextRequest } from "next/server";
import { ingestCommandResults } from "@yghr/db";
import { prisma } from "@yghr/db";
import { deviceBySn, text } from "@/server/iclock";
import { emit } from "@/server/realtime";

/** Command results reported by the device ("ID=12&Return=0&CMD=DATA"). */
export async function POST(req: NextRequest) {
  const device = await deviceBySn(req.nextUrl.searchParams.get("SN"));
  if (!device) return text("Unknown device", 401);
  const done = await ingestCommandResults(prisma, device.id, (await req.text()).slice(0, 200_000));
  if (done) await emit(device.organizationId, "device:status", { id: device.id, status: "ONLINE" });
  return text("OK");
}
