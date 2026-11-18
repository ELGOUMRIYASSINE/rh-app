import type { NextRequest } from "next/server";
import { deviceBySn, text } from "@/server/iclock";

/** Command results reported by the device. */
export async function POST(req: NextRequest) {
  const device = await deviceBySn(req.nextUrl.searchParams.get("SN"));
  if (!device) return text("Unknown device", 401);
  return text("OK");
}
