import { NextResponse } from "next/server";
import { vapidKeys } from "@/server/push-keys";

/** Public VAPID key, read at runtime (not baked into the build). */
export async function GET() {
  const { publicKey } = await vapidKeys();
  return NextResponse.json({ publicKey }, { headers: { "cache-control": "no-store" } });
}
