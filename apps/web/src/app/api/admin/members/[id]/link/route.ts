import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";
import { createAuthToken } from "@/server/auth";
import { inviteEmail, resetEmail } from "@/server/mail";

/** Send (and return) an access link: an invitation if the account was never activated, otherwise a password reset. */
export const POST = platformRoute({}, async ({ params, log }) => {
  const m = await prisma.membership.findUnique({ where: { id: params.id! }, include: { user: true, organization: true } });
  if (!m) fail(404, "Compte introuvable.");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const kind = m!.user.passwordHash ? "RESET" : "INVITE";
  const token = await createAuthToken(kind, m!.userId, m!.organizationId);
  const url = `${base}/${kind === "INVITE" ? "invite" : "reset"}/${token}`;
  const emailSent = kind === "INVITE" ? await inviteEmail({ to: m!.user.email, firstName: m!.user.firstName, orgName: m!.organization.name, token }) : await resetEmail({ to: m!.user.email, firstName: m!.user.firstName, token });
  await log(m!.organizationId, "UPDATE", "MEMBERSHIP", m!.userId, { email: m!.user.email, link: kind });
  return { url, kind, emailSent: !!emailSent };
});
