import { z } from "zod";
import { diffDays } from "@yghr/core";
import { fail, route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { planningData } from "@/server/planning";
import { planningPdf } from "@/server/pdf/planning-pdf";
import { fileResponse } from "@/server/excel";
import { getBranding } from "@/server/branding";

export const GET = route({ feature: "planning", permission: "planning.manage", query: z.object({ from: zDate, to: zDate }) }, async ({ s, query, log }) => {
  if (query.to < query.from || diffDays(query.to, query.from) > 42) fail(400, "Période invalide.");
  const data = await planningData(s.org.id, query.from, query.to, { employeeIds: scopeEmployeeIds(s) });
  const buf = await planningPdf(await getBranding(s.org.id), data);
  await log("EXPORT", "PLANNING", null, { pdf: true, from: query.from, to: query.to });
  return fileResponse(buf, `planning-${query.from}.pdf`, "application/pdf");
});
