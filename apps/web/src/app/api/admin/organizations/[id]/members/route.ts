import { z } from "zod";
import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";
import { createAuthToken } from "@/server/auth";
import { inviteEmail } from "@/server/mail";

/** Add an RH administrator account to a clinic (invited by e-mail). */
export const POST = platformRoute(
  { body: z.object({ firstName: z.string().trim().min(1, "Prénom requis").max(80), lastName: z.string().trim().min(1, "Nom requis").max(80), email: z.string().trim().toLowerCase().email("E-mail invalide") }) },
  async ({ body, params, log }) => {
    const org = await prisma.organization.findUnique({ where: { id: params.id! } });
    if (!org) fail(404, "Clinique introuvable.");
    const user = await prisma.user.upsert({ where: { email: body.email }, create: { email: body.email, firstName: body.firstName, lastName: body.lastName }, update: {} });
    const m = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: org!.id } } });
    if (m) await prisma.membership.update({ where: { id: m.id }, data: { role: "RH", active: true } });
    else await prisma.membership.create({ data: { userId: user.id, organizationId: org!.id, role: "RH" } });
    let inviteUrl: string | null = null;
    let emailSent = false;
    if (!user.passwordHash) {
      const token = await createAuthToken("INVITE", user.id, org!.id);
      inviteUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
      emailSent = await inviteEmail({ to: user.email, firstName: user.firstName, orgName: org!.name, token });
    }
    await log(org!.id, "CREATE", "MEMBERSHIP", user.id, { email: user.email, role: "RH" });
    return { inviteUrl, emailSent, existingAccount: !!user.passwordHash };
  },
);
