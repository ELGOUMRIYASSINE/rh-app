import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { balancesFor, entitlementsOverview } from "@/server/leave";
import { notify, rhUserIds, emit } from "@/server/realtime";

/** Annual paid-leave allowance of every employee in scope for the current period. */
export const GET = route({ feature: "leaves", allowEmployee: true }, async ({ s }) => {
  const overview = await entitlementsOverview(s.org.id, scopeEmployeeIds(s));
  return { enabled: !!overview, ...(overview ?? { items: [] }) };
});

/**
 * Declare the annual paid-leave allowance (e.g. 18, 21 or 30 days) for the current period.
 * DECISION: an employee declares their own allowance once per period; afterwards only RH can change it.
 */
export const PUT = route(
  { feature: "leaves", allowEmployee: true, body: z.object({ employeeId: z.string().optional(), days: z.number().min(0.5, "Indiquez un nombre de jours valide.").max(60, "60 jours maximum par an.").multipleOf(0.5, "Utilisez des demi-journées au plus.") }) },
  async ({ s, body, log }) => {
    const employeeId = body.employeeId || s.employeeId;
    if (!employeeId) fail(400, "Salarié requis.");
    const isRh = s.role === "RH" || s.role === "SUPER_ADMIN";
    const forSelf = employeeId === s.employeeId;
    if (!forSelf && !isRh) fail(403, "Seul le responsable RH peut définir le solde annuel d'un autre salarié.");
    const emp = await prisma.employee.findFirst({ where: { id: employeeId!, organizationId: s.org.id } });
    if (!emp) fail(404, "Salarié introuvable.");
    const bal = (await balancesFor(s.org.id, emp!.id)).find((b) => b.type === "PAID_LEAVE");
    if (!bal) fail(400, "Les congés payés ne sont pas activés dans la politique de congés.");
    if (bal!.entitlement !== null && !isRh) fail(403, `Votre solde annuel ${bal!.periodYear} est déjà déclaré (${bal!.entitlement} j). Contactez votre responsable RH pour le modifier.`);
    const key = { employeeId_leaveType_periodYear: { employeeId: emp!.id, leaveType: "PAID_LEAVE" as const, periodYear: bal!.periodYear } };
    const data = { entitlement: body.days, declaredAt: new Date(), declaredById: s.userId };
    await prisma.leaveBalance.upsert({ where: key, create: { employeeId: emp!.id, leaveType: "PAID_LEAVE", periodYear: bal!.periodYear, ...data }, update: data });
    const name = `${emp!.firstName} ${emp!.lastName}`;
    if (forSelf && !isRh) {
      const to = (await rhUserIds(s.org.id)).filter((u) => u !== s.userId);
      await notify(s.org.id, to, { type: "leave", title: "Solde de congés déclaré", body: `${name} a déclaré ${body.days} j de congés payés pour ${bal!.periodYear}.`, link: `/${s.org.slug}/rh/conges` });
    }
    await emit(s.org.id, "leave:updated", { employeeId: emp!.id });
    await log(bal!.entitlement === null ? "CREATE" : "UPDATE", "LEAVE_BALANCE", emp!.id, { employee: name, periodYear: bal!.periodYear, before: bal!.entitlement, entitlement: body.days });
    return { ok: true, periodYear: bal!.periodYear, entitlement: body.days, available: Math.round((body.days + bal!.adjusted - bal!.taken) * 100) / 100 };
  },
);
