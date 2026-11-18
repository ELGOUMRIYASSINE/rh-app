import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { prisma } from "@yghr/db";
import { signChallenge, verifyChallenge, verifyPassword } from "@/server/auth";
import { audit } from "@/server/audit";
import { clientIp, errorResponse } from "@/server/api";
import { completeLogin } from "@/server/login";
import { rateLimit, rateLimitHit, rateLimitPeek } from "@/server/rate-limit";

const Body = z.union([
  z.object({ email: z.string().trim().toLowerCase().email("E-mail invalide"), password: z.string().min(1, "Mot de passe requis"), persistent: z.boolean().optional(), next: z.string().optional() }),
  z.object({ challenge: z.string(), code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres"), next: z.string().optional() }),
]);

function slugFromNext(next?: string) {
  return next?.match(/^\/([a-z0-9-]+)\/(rh|chef|salarie)/)?.[1] ?? null;
}
function safeNext(next: string | undefined, fallback: string) {
  if (next && next.startsWith("/") && !next.startsWith("//") && next.split("/")[1] === fallback.split("/")[1]) return next;
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");
    const body = Body.parse(await req.json());

    if ("challenge" in body) {
      const ch = await verifyChallenge(body.challenge);
      if (!ch) return NextResponse.json({ error: "Session de connexion expirée, recommencez." }, { status: 401 });
      const rl = rateLimit(`2fa:${ch.userId}`, 6, 5 * 60_000);
      if (!rl.ok) return NextResponse.json({ error: `Trop de tentatives. Réessayez dans ${rl.retryAfter} s.` }, { status: 429 });
      const user = await prisma.user.findUnique({ where: { id: ch.userId } });
      const totp = user?.totpSecret ? new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret), issuer: "YGHR", label: user.email }) : null;
      if (!user || !totp || totp.validate({ token: body.code, window: 1 }) === null) {
        await audit({ organizationId: null, userId: ch.userId, action: "LOGIN_FAILED", entity: "USER", entityId: ch.userId, details: { reason: "2FA" }, ip, userAgent });
        return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
      }
      const to = await completeLogin(user.id, ch.persistent, { ip, userAgent }, slugFromNext(body.next));
      return NextResponse.json({ redirect: safeNext(body.next, to) });
    }

    const rlKey = `login:${ip}:${body.email}`;
    const rl = rateLimitPeek(rlKey, 8, 15 * 60_000);
    if (!rl.ok) return NextResponse.json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` }, { status: 429 });
    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { memberships: { where: { active: true }, select: { organizationId: true } } } });
    const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !ok) {
      rateLimitHit(rlKey);
      await audit({ organizationId: user?.memberships[0]?.organizationId ?? null, userId: user?.id ?? null, action: "LOGIN_FAILED", entity: "USER", entityId: user?.id, details: { email: body.email }, ip, userAgent });
      return NextResponse.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
    }
    if (!user.memberships.length) return NextResponse.json({ error: "Votre compte n'est rattaché à aucune organisation active." }, { status: 403 });
    if (user.totpEnabled) return NextResponse.json({ twoFactor: true, challenge: await signChallenge(user.id, body.persistent ?? true) });
    const to = await completeLogin(user.id, body.persistent ?? true, { ip, userAgent }, slugFromNext(body.next));
    return NextResponse.json({ redirect: safeNext(body.next, to) });
  } catch (e) {
    return errorResponse(e);
  }
}
