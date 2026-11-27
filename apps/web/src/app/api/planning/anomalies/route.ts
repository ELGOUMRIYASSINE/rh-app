import { z } from "zod";
import { prisma, analyzeOrgPlanning } from "@yghr/db";
import { diffDays } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";

export const GET = route({ feature: "planning", permission: "planning.manage", query: z.object({ from: zDate, to: zDate }) }, async ({ s, query }) => {
  if (query.to < query.from) fail(400, "Période invalide.");
  if (diffDays(query.to, query.from) > 92) fail(400, "L'analyse est limitée à 3 mois.");
  const scope = scopeEmployeeIds(s);
  const anomalies = await analyzeOrgPlanning(prisma, s.org.id, query.from, query.to, scope ? { employeeIds: scope } : {});
  return {
    anomalies,
    blocking: anomalies.filter((a) => a.severity === "BLOCKING" && !a.exceptionId).length,
    warnings: anomalies.filter((a) => a.severity === "WARNING" && !a.exceptionId).length,
    excepted: anomalies.filter((a) => a.exceptionId).length,
  };
});
