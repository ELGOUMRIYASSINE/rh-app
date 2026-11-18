import { z } from "zod";
import { diffDays } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { planningData } from "@/server/planning";

export const GET = route({ feature: "planning", permission: "planning.manage", query: z.object({ from: zDate, to: zDate }) }, async ({ s, query }) => {
  if (query.to < query.from || diffDays(query.to, query.from) > 42) fail(400, "Période invalide (6 semaines maximum).");
  return planningData(s.org.id, query.from, query.to, { employeeIds: scopeEmployeeIds(s) });
});
