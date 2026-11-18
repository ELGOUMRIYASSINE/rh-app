import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@yghr/db";
import { ACCESS_COOKIE, REFRESH_COOKIE, setAuthCookies, sha256, verifyAccess } from "@/server/auth";
import { errorResponse } from "@/server/api";
import { spaceForRole } from "@/server/context";

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = z.object({ organizationId: z.string() }).parse(await req.json());
    const jar = await cookies();
    const claims = await verifyAccess(jar.get(ACCESS_COOKIE)?.value);
    const rt = jar.get(REFRESH_COOKIE)?.value;
    if (!claims || !rt) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const m = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: claims.sub, organizationId } }, include: { organization: true } });
    if (!m || !m.active) return NextResponse.json({ error: "Organisation inaccessible." }, { status: 403 });
    const session = await prisma.session.update({ where: { id: claims.sid }, data: { organizationId } });
    if (session.refreshTokenHash !== sha256(rt)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    await setAuthCookies({ userId: claims.sub, sessionId: session.id, organizationId, persistent: true, expiresAt: session.expiresAt });
    return NextResponse.json({ redirect: `/${m.organization.slug}/${spaceForRole(m.role)}` });
  } catch (e) {
    return errorResponse(e);
  }
}
