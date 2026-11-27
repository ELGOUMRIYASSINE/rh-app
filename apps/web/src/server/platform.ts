import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { prisma } from "@yghr/db";
import { ACCESS_COOKIE, verifyAccess } from "./auth";
import { audit, type AuditAction } from "./audit";
import { clientIp, errorResponse } from "./api";

/**
 * Platform console (the app owner and the support team). Access is a flag on the user,
 * independent from any clinic membership.
 */
export interface PlatformAdmin { id: string; email: string; firstName: string; lastName: string; sessionId: string }

export const getPlatformAdmin = cache(async (): Promise<PlatformAdmin | null> => {
  const claims = await verifyAccess((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!claims) return null;
  const session = await prisma.session.findUnique({ where: { id: claims.sid }, select: { revokedAt: true } });
  if (!session || session.revokedAt) return null;
  const u = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true } });
  if (!u?.isPlatformAdmin) return null;
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, sessionId: claims.sid };
});

export async function requirePlatformPage(): Promise<PlatformAdmin> {
  const a = await getPlatformAdmin();
  if (!a) {
    const path = (await headers()).get("x-yghr-path") ?? "/admin";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return a;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;
export interface PlatformCtx<B> {
  req: NextRequest;
  admin: PlatformAdmin;
  body: B;
  params: Record<string, string>;
  log: (organizationId: string | null, action: AuditAction, entity: string, entityId?: string | null, details?: unknown) => Promise<void>;
}

/** API wrapper for /api/admin/*: platform admin only, Zod body, uniform errors, audit helper. */
export function platformRoute<B extends ZodType | undefined = undefined>(opts: { body?: B }, handler: (ctx: PlatformCtx<Infer<B>>) => Promise<unknown>) {
  return async (req: NextRequest, segment: { params: Promise<Record<string, string>> }) => {
    try {
      const admin = await getPlatformAdmin();
      if (!admin) return NextResponse.json({ error: "Réservé à l'équipe YGHR." }, { status: 403 });
      let body: unknown;
      if (opts.body) body = opts.body.parse(req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => ({})) : {});
      const params = (await segment?.params) ?? {};
      const ip = clientIp(req);
      const userAgent = req.headers.get("user-agent");
      const log = (organizationId: string | null, action: AuditAction, entity: string, entityId?: string | null, details?: unknown) =>
        audit({ organizationId, userId: admin.id, action, entity, entityId, details: { ...(details as object), by: "platform" }, ip, userAgent });
      const result = await handler({ req, admin, body: body as Infer<B>, params, log });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e, { req });
    }
  };
}
