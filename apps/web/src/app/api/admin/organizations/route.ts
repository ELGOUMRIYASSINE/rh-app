import { z } from "zod";
import { createOrganization, prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";
import { createAuthToken } from "@/server/auth";
import { inviteEmail } from "@/server/mail";

const Body = z.object({
  name: z.string().trim().min(2, "Nom requis").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement").max(60),
  planName: z.string().min(1),
  kind: z.enum(["client", "demo"]),
  trialDays: z.coerce.number().int().min(1).max(365).default(30),
  demoData: z.boolean().default(false),
  admin: z.object({ firstName: z.string().trim().min(1, "Prénom requis").max(80), lastName: z.string().trim().min(1, "Nom requis").max(80), email: z.string().trim().toLowerCase().email("E-mail invalide") }),
});

/** Create a customer clinic + its RH administrator account (invited by e-mail). */
export const POST = platformRoute({ body: Body }, async ({ body, admin }) => {
  let created;
  try {
    created = await createOrganization(prisma, {
      name: body.name, slug: body.slug, planName: body.planName, admin: body.admin, source: "console", createdBy: admin.id,
      status: body.kind === "demo" ? "TRIAL" : "ACTIVE",
      trialEndsAt: body.kind === "demo" ? new Date(Date.now() + body.trialDays * 86400_000) : null,
      demoData: body.demoData,
    });
  } catch (e) {
    fail(400, (e as Error).message);
  }
  const { org, user, hasPassword } = created!;
  let inviteUrl: string | null = null;
  let emailSent = false;
  if (!hasPassword) {
    const token = await createAuthToken("INVITE", user.id, org.id);
    inviteUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
    emailSent = await inviteEmail({ to: user.email, firstName: user.firstName, orgName: org.name, token });
  }
  return { id: org.id, slug: org.slug, inviteUrl, emailSent, existingAccount: hasPassword, email: user.email };
});
