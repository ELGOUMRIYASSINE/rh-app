import "server-only";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@yghr/db";

export const ACCESS_COOKIE = "yghr_at";
export const REFRESH_COOKIE = "yghr_rt";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;
const SHORT_SESSION_HOURS = 12;

export interface AccessClaims {
  sub: string; // userId
  sid: string; // sessionId
  org: string | null; // active organizationId
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET manquant ou trop court (32 caractères minimum)");
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function signAccess(claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, org: claims.org })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .setIssuer("yghr")
    .sign(secret());
}

export async function verifyAccess(token: string | undefined): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "yghr" });
    return { sub: payload.sub!, sid: payload.sid as string, org: (payload.org as string | null) ?? null };
  } catch {
    return null;
  }
}

/** Short-lived token used between the password step and the 2FA step. */
export async function signChallenge(userId: string, persistent: boolean): Promise<string> {
  return new SignJWT({ p: persistent, kind: "2fa" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setExpirationTime("5m").setIssuer("yghr").sign(secret());
}
export async function verifyChallenge(token: string): Promise<{ userId: string; persistent: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "yghr" });
    if (payload.kind !== "2fa") return null;
    return { userId: payload.sub!, persistent: !!payload.p };
  } catch {
    return null;
  }
}

const isProd = process.env.NODE_ENV === "production";
const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: isProd, path: "/" };

/** Create a session (refresh token) and set both cookies. */
export async function startSession(opts: { userId: string; organizationId: string | null; persistent: boolean; ip?: string | null; userAgent?: string | null }) {
  const refresh = randomToken(48);
  const expiresAt = new Date(Date.now() + (opts.persistent ? REFRESH_TTL_DAYS * 86400_000 : SHORT_SESSION_HOURS * 3600_000));
  const session = await prisma.session.create({
    data: { userId: opts.userId, organizationId: opts.organizationId, refreshTokenHash: sha256(refresh), expiresAt, ip: opts.ip ?? null, userAgent: opts.userAgent ?? null },
  });
  await setAuthCookies({ userId: opts.userId, sessionId: session.id, organizationId: opts.organizationId, refresh, persistent: opts.persistent, expiresAt });
  return session;
}

export async function setAuthCookies(o: { userId: string; sessionId: string; organizationId: string | null; refresh?: string; persistent: boolean; expiresAt: Date }) {
  const jar = await cookies();
  const at = await signAccess({ sub: o.userId, sid: o.sessionId, org: o.organizationId });
  jar.set(ACCESS_COOKIE, at, { ...cookieBase, maxAge: ACCESS_TTL_SECONDS });
  if (o.refresh) jar.set(REFRESH_COOKIE, o.refresh, { ...cookieBase, ...(o.persistent ? { expires: o.expiresAt } : {}) });
}

/** Rotate the refresh token. Returns the new claims, or null when the session is invalid. */
export async function refreshSession(meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<AccessClaims | null> {
  const jar = await cookies();
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: sha256(rt) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    await clearAuthCookies();
    return null;
  }
  const next = randomToken(48);
  const persistent = session.expiresAt.getTime() - session.createdAt.getTime() > SHORT_SESSION_HOURS * 3600_000 + 60_000;
  await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: sha256(next), lastUsedAt: new Date(), ip: meta.ip ?? session.ip, userAgent: meta.userAgent ?? session.userAgent } });
  await setAuthCookies({ userId: session.userId, sessionId: session.id, organizationId: session.organizationId, refresh: next, persistent, expiresAt: session.expiresAt });
  return { sub: session.userId, sid: session.id, org: session.organizationId };
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export function passwordIssues(pw: string): string | null {
  if (pw.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Le mot de passe doit contenir des lettres et des chiffres.";
  return null;
}

/** Create an invite / reset token valid 7 days. Returns the raw token for the e-mail link. */
export async function createAuthToken(type: "INVITE" | "RESET", userId: string, organizationId: string | null): Promise<string> {
  const raw = randomToken(32);
  await prisma.authToken.create({ data: { type, userId, organizationId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  return raw;
}
