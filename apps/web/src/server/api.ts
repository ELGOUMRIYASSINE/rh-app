import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import type { FeatureKey, Permission } from "@yghr/core";
import { Prisma } from "@yghr/db";
import { getSession, type SessionContext, canDo } from "./context";
import { audit, type AuditAction } from "./audit";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const fail = (status: number, message: string, details?: unknown): never => {
  throw new ApiError(status, message, details);
};

export interface ApiCtx<B, Q> {
  req: NextRequest;
  s: SessionContext;
  body: B;
  query: Q;
  params: Record<string, string>;
  ip: string | null;
  userAgent: string | null;
  /** Write an audit entry for the current user / org. */
  log: (action: AuditAction, entity: string, entityId?: string | null, details?: unknown) => Promise<void>;
}

interface Options<B extends ZodType | undefined, Q extends ZodType | undefined> {
  feature?: FeatureKey;
  /** RH always passes; CHEF needs this permission; SALARIE never passes unless `allowEmployee`. */
  permission?: Permission;
  /** Only RH (and super admin). */
  rhOnly?: boolean;
  allowEmployee?: boolean;
  body?: B;
  query?: Q;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

/**
 * Wrap a route handler: authentication, tenant context, plan gating (403), permission check,
 * Zod validation and uniform French JSON errors.
 */
export function route<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined>(
  opts: Options<B, Q>,
  handler: (ctx: ApiCtx<Infer<B>, Infer<Q>>) => Promise<unknown>,
) {
  return async (req: NextRequest, segment: { params: Promise<Record<string, string>> }) => {
    try {
      const s = await getSession();
      if (!s) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
      if (opts.feature && !s.org.features.includes(opts.feature)) fail(403, "Cette fonctionnalité n'est pas incluse dans votre pack.");
      if (opts.rhOnly && s.role !== "RH" && s.role !== "SUPER_ADMIN") fail(403, "Action réservée au responsable RH.");
      if (s.role === "SALARIE" && !opts.allowEmployee) fail(403, "Accès refusé.");
      if (opts.permission && s.role !== "SALARIE" && !canDo(s, opts.permission)) fail(403, "Vous n'avez pas le droit d'effectuer cette action.");

      let body: unknown = undefined;
      if (opts.body) {
        const raw = req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => fail(400, "Corps de requête invalide.")) : {};
        body = opts.body.parse(raw);
      }
      let query: unknown = undefined;
      if (opts.query) query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      const params = (await segment?.params) ?? {};
      const ip = clientIp(req);
      const userAgent = req.headers.get("user-agent");
      const log = (action: AuditAction, entity: string, entityId?: string | null, details?: unknown) =>
        audit({ organizationId: s.org.id, userId: s.userId, action, entity, entityId, details, ip, userAgent });

      const result = await handler({ req, s, body: body as Infer<B>, query: query as Infer<Q>, params, ip, userAgent, log });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: first ? `${first.path.join(".") || "Champ"} : ${first.message}` : "Données invalides.", issues: e.issues }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: "Cet élément existe déjà." }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });
  }
  if (e && typeof e === "object" && "digest" in e) throw e; // Next.js redirect / notFound
  console.error(e);
  return NextResponse.json({ error: e instanceof Error && process.env.NODE_ENV !== "production" ? e.message : "Une erreur est survenue." }, { status: 500 });
}

// ── Common Zod helpers ──
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue AAAA-MM-JJ");
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure attendue HH:MM");
export const zId = z.string().min(1).max(64);
export const zOptStr = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
export const zOptNum = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "nombre invalide" });
      return z.NEVER;
    }
    return n;
  });
