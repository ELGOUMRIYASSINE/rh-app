import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@yghr/db";
import { hashPassword, passwordIssues } from "@/server/auth";
import { clientIp, errorResponse } from "@/server/api";
import { findValidToken } from "@/server/tokens";
import { completeLogin } from "@/server/login";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = z.object({ token: z.string(), password: z.string() }).parse(await req.json());
    const issue = passwordIssues(password);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    const t = await findValidToken(token, "INVITE");
    if (!t) return NextResponse.json({ error: "Cette invitation a expiré ou a déjà été utilisée. Demandez à votre responsable de la renvoyer." }, { status: 400 });
    await prisma.$transaction([
      prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(password) } }),
      prisma.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    ]);
    const redirect = await completeLogin(t.userId, true, { ip: clientIp(req), userAgent: req.headers.get("user-agent") }, t.organization?.slug);
    return NextResponse.json({ redirect });
  } catch (e) {
    return errorResponse(e);
  }
}
