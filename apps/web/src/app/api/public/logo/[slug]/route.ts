import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@yghr/db";
import { readObject } from "@/server/storage";

/**
 * Public clinic logo (used by the sidebar, kiosk tablets, login/org picker and the browser tab).
 * A logo is not confidential: it is printed on every document the clinic hands out.
 * URLs carry ?v=<file id> so a new upload busts the cache.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, logoUrl: true } });
  const key = org?.logoUrl?.replace(/^\/api\/files\//, "");
  if (!org || !key || !key.startsWith(`${org.id}/branding/`)) return new NextResponse(null, { status: 404 });
  const obj = await readObject(key);
  if (!obj || !/^image\/(png|jpeg)$/.test(obj.contentType)) return new NextResponse(null, { status: 404 });
  return new Response(obj.body as unknown as BodyInit, {
    headers: { "content-type": obj.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
