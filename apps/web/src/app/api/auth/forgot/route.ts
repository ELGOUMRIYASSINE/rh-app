import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@yghr/db";
import { createAuthToken } from "@/server/auth";
import { clientIp, errorResponse } from "@/server/api";
import { resetEmail } from "@/server/mail";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email("E-mail invalide") }).parse(await req.json());
    if (!rateLimit(`forgot:${clientIp(req)}`, 5, 15 * 60_000).ok) return NextResponse.json({ error: "Trop de demandes, réessayez plus tard." }, { status: 429 });
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await createAuthToken("RESET", user.id, null);
      await resetEmail({ to: user.email, firstName: user.firstName, token });
    }
    // Same answer whether the account exists or not.
    return NextResponse.json({ ok: true, message: "Si un compte existe pour cette adresse, un e-mail vient d'être envoyé." });
  } catch (e) {
    return errorResponse(e);
  }
}
