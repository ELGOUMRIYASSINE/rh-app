import { z } from "zod";
import { prisma, calculatePeriod } from "@yghr/db";
import { fail, route } from "@/server/api";
import { notify } from "@/server/realtime";

/** calculate | validate | lock | unlock (RH, with a reason, audited). */
export const POST = route({ feature: "payroll", permission: "payroll.validate", body: z.object({ reason: z.string().max(500).optional() }) }, async ({ s, params, body, log }) => {
  const p = await prisma.payrollPeriod.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!p) fail(404, "Période introuvable.");
  const period = p!;
  switch (params.action) {
    case "calculate": {
      if (period.status === "VALIDATED" || period.status === "LOCKED") fail(409, "Période validée ou verrouillée : déverrouillez-la avant de recalculer.");
      const r = await calculatePeriod(prisma, period.id);
      await log("CALCULATE", "PAYROLLPERIOD", period.id, r);
      return { ...r, message: `${r.count} bulletin(s) calculé(s).${r.unvalidatedDays ? ` Attention : ${r.unvalidatedDays} journée(s) de présence non validée(s).` : ""}` };
    }
    case "validate": {
      if (period.status !== "CALCULATED") fail(409, "Calculez la période avant de la valider.");
      await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "VALIDATED", validatedById: s.userId, validatedAt: new Date() } });
      await log("VALIDATE", "PAYROLLPERIOD", period.id);
      return { ok: true };
    }
    case "lock": {
      if (s.role !== "RH") fail(403, "Seul le responsable RH peut verrouiller la paie.");
      if (period.status !== "VALIDATED") fail(409, "Validez la période avant de la verrouiller.");
      await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "LOCKED", lockedAt: new Date() } });
      // Payslips become available to employees.
      const users = await prisma.membership.findMany({ where: { organizationId: s.org.id, active: true, employee: { payslips: { some: { periodId: period.id } } } }, select: { userId: true } });
      await notify(s.org.id, users.map((u) => u.userId), { type: "payroll", title: "Bulletin de paie disponible", body: `Votre bulletin de ${String(period.month).padStart(2, "0")}/${period.year} est disponible.`, link: `/${s.org.slug}/salarie/documents` });
      await log("LOCK", "PAYROLLPERIOD", period.id);
      return { ok: true };
    }
    case "unlock": {
      if (s.role !== "RH") fail(403, "Seul le responsable RH peut déverrouiller la paie.");
      if (period.status !== "LOCKED" && period.status !== "VALIDATED") fail(409, "La période n'est ni validée ni verrouillée.");
      if (!body.reason || body.reason.trim().length < 5) fail(400, "Indiquez le motif du déverrouillage (5 caractères minimum).");
      await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "CALCULATED", lockedAt: null, validatedAt: null, validatedById: null } });
      await log("UNLOCK", "PAYROLLPERIOD", period.id, { reason: body.reason, previous: period.status });
      return { ok: true };
    }
    default:
      fail(404, "Action inconnue.");
  }
});
