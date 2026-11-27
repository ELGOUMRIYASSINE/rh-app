import "server-only";
import { prisma } from "@yghr/db";
import { sha256 } from "./auth";

export async function findValidToken(raw: string, type: "INVITE" | "RESET") {
  const t = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true, organization: true } });
  if (!t || t.type !== type || t.usedAt || t.expiresAt < new Date()) return null;
  return t;
}
