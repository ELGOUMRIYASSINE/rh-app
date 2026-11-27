import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { webPush } from "@/server/realtime";

/** Internal: the background worker asks the web app to send Web Push notifications (same secret as realtime). */
export async function POST(req: NextRequest) {
  const secret = process.env.REALTIME_INTERNAL_SECRET ?? "";
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = z.object({ userIds: z.array(z.string()).max(500), title: z.string().max(200), body: z.string().max(1000), link: z.string().max(500).optional() }).parse(await req.json());
  await webPush(body.userIds, body);
  return NextResponse.json({ ok: true });
}
