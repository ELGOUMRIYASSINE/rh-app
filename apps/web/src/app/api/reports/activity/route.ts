import { z } from "zod";
import { diffDays } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { activityReport } from "@/server/reports";

export const GET = route({ feature: "reports", permission: "reports.view", query: z.object({ from: zDate, to: zDate, role: z.enum(["all", "employees", "leads"]).optional(), q: z.string().optional() }) }, async ({ s, query }) => {
  if (query.to < query.from || diffDays(query.to, query.from) > 366) fail(400, "Période invalide (1 an maximum).");
  const r = await activityReport(s.org.id, query.from, query.to, { role: query.role, q: query.q, employeeIds: scopeEmployeeIds(s) });
  if (!canDo(s, "rates.view")) r.rows.forEach((x) => { x.hourlyRate = null; x.monthlyBase = null; });
  return r;
});
