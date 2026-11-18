import { z } from "zod";
import { prisma, dbDate, fromDbDate, analyzeOrgPlanning } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { ruleChange } from "@/server/audit";

export const GET = route({ feature: "planning", permission: "planning.manage", query: z.object({ from: zDate, to: zDate }) }, async ({ s, query }) => {
  const items = await prisma.planningException.findMany({ where: { organizationId: s.org.id, date: { gte: dbDate(query.from), lte: dbDate(query.to) } }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { date: "asc" } });
  const approvers = await prisma.user.findMany({ where: { id: { in: items.map((i) => i.approvedById) } }, select: { id: true, firstName: true, lastName: true } });
  return { items: items.map((i) => ({ ...i, date: fromDbDate(i.date), approver: approvers.find((a) => a.id === i.approvedById) ?? null })) };
});

/** Authorise a justified exception for one anomaly (by its deterministic key). */
export const POST = route(
  { feature: "planning", permission: "planning.manage", body: z.object({ anomalyKey: z.string().min(3).max(300), date: zDate, justification: z.string().trim().min(5, "Justification trop courte (5 caractères minimum)").max(1000) }) },
  async ({ s, body, log }) => {
    const anomalies = await analyzeOrgPlanning(prisma, s.org.id, body.date, body.date);
    const a = anomalies.find((x) => x.key === body.anomalyKey);
    if (!a) fail(404, "Cette anomalie n'existe plus : actualisez la liste.");
    if (!a!.exceptionAllowed) fail(400, "Cette règle n'autorise pas d'exception.");
    const ex = await prisma.planningException.upsert({
      where: { organizationId_anomalyKey: { organizationId: s.org.id, anomalyKey: body.anomalyKey } },
      create: { organizationId: s.org.id, anomalyKey: body.anomalyKey, anomalyType: a!.type, ruleId: a!.ruleId ?? null, date: dbDate(body.date), employeeId: a!.employeeId ?? null, justification: body.justification, approvedById: s.userId },
      update: { justification: body.justification, approvedById: s.userId },
    });
    await ruleChange(s.org.id, s.userId, "PLANNING_EXCEPTION", ex.id, "CREATE", null, { ...ex, title: a!.title, message: a!.message });
    await log("CREATE", "PLANNING_EXCEPTION", ex.id, { anomaly: a!.message, justification: body.justification });
    return { item: ex };
  },
);
