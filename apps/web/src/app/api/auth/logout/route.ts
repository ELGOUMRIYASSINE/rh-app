import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@yghr/db";
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, sha256, verifyAccess } from "@/server/auth";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/api";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const claims = await verifyAccess(jar.get(ACCESS_COOKIE)?.value);
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (rt) await prisma.session.updateMany({ where: { refreshTokenHash: sha256(rt) }, data: { revokedAt: new Date() } });
  if (claims) await audit({ organizationId: claims.org, userId: claims.sub, action: "LOGOUT", entity: "USER", entityId: claims.sub, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  await clearAuthCookies();
  return NextResponse.json({ redirect: "/login" });
}
