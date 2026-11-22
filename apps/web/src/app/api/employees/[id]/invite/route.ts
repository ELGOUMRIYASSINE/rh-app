import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { createAuthToken } from "@/server/auth";
import { inviteEmail } from "@/server/mail";
import { provisionAccess } from "@/server/employees";

/** Resend the 7-day invitation (or create the account if missing). */
export const POST = route({ feature: "employees", permission: "team.add" }, async ({ s, params, log }) => {
  if (!canDo(s, "team.add", params.id) && s.role !== "RH") fail(403, "Accès refusé.");
  const e = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { membership: { include: { user: true } } } });
  if (!e) fail(404, "Salarié introuvable.");
  if (!s.org.features.includes("employee_accounts")) fail(400, "Les comptes salariés ne sont pas activés pour votre établissement.");
  if (e!.email.endsWith(".invalid")) fail(400, "Complétez d'abord l'e-mail de ce salarié dans sa fiche (il a été créé depuis la pointeuse).");
  const user = e!.membership?.user;
  if (user?.passwordHash) fail(400, "Ce salarié a déjà activé son compte. Il peut utiliser « Mot de passe oublié » si besoin.");
  if (!user) await provisionAccess({ organizationId: s.org.id, orgName: s.org.name, employeeId: e!.id, email: e!.email, firstName: e!.firstName, lastName: e!.lastName });
  else {
    await prisma.authToken.updateMany({ where: { userId: user.id, type: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
    const token = await createAuthToken("INVITE", user.id, s.org.id);
    await inviteEmail({ to: user.email, firstName: user.firstName, orgName: s.org.name, token });
  }
  await log("UPDATE", "EMPLOYEE", e!.id, { invitation: "resent" });
  return { ok: true, message: `Invitation renvoyée à ${e!.email}.` };
});
