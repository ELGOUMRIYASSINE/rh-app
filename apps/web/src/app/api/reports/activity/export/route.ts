import { z } from "zod";
import { fail, route, zDate } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { activityReport } from "@/server/reports";
import { fileResponse, workbookBuffer } from "@/server/excel";

const h = (m: number) => Math.round((m / 60) * 100) / 100;
const CONTRACT: Record<string, string> = { CDI: "CDI", CDD: "CDD", INTERIM: "Intérim", STAGE: "Stage" };

export const GET = route({ feature: "reports", permission: "data.export", query: z.object({ from: zDate, to: zDate, role: z.enum(["all", "employees", "leads"]).optional() }) }, async ({ s, query, log }) => {
  if (query.to < query.from) fail(400, "Période invalide.");
  const r = await activityReport(s.org.id, query.from, query.to, { role: query.role, employeeIds: scopeEmployeeIds(s) });
  const rates = canDo(s, "rates.view");
  const columns = [
    { header: "Employé", key: "name", width: 26 }, { header: "Matricule", key: "matricule" },
    { header: "Type", key: "contract" }, { header: "Durée hebdo", key: "weeklyHours" },
    ...(rates ? [{ header: "Taux hor.", key: "hourlyRate", numFmt: "#,##0.00" }, { header: "Base mens.", key: "monthlyBase", numFmt: "#,##0.00" }] : []),
    { header: "Pause (h)", key: "pause", numFmt: "0.00" },
    ...r.weeks.map((w) => ({ header: w.label, key: w.key, numFmt: "0.00" })),
    { header: "H. travaillées", key: "worked", numFmt: "0.00" }, { header: "H. normales", key: "normal", numFmt: "0.00" }, { header: "H. nuit", key: "night", numFmt: "0.00" }, { header: "H. supp", key: "overtime", numFmt: "0.00" },
    { header: "Jours abs.", key: "absentDays" }, { header: "Heures abs.", key: "absentHours", numFmt: "0.00" },
    { header: "Primes (DH)", key: "primes", numFmt: "#,##0.00" }, { header: "Avances (DH)", key: "advances", numFmt: "#,##0.00" }, { header: "Transport (DH)", key: "transport", numFmt: "#,##0.00" },
  ];
  const groups = [{ label: "EMPLOYÉS", span: 2 }, { label: "DONNÉES CONTRACTUELLES", span: 2 }, ...(rates ? [{ label: "DONNÉES SALARIALES", span: 2 }] : []), { label: "HEURES PLANNING PÉRIODE", span: 1 + r.weeks.length + 4 }, { label: "TOTAL ABSENCES PÉRIODE", span: 2 }, { label: "ÉLÉMENTS DE RÉMUNÉRATION", span: 3 }];
  const rows = r.rows.map((x) => ({ ...x, contract: x.contractType ? CONTRACT[x.contractType] : "", pause: h(x.breakMinutes), ...Object.fromEntries(r.weeks.map((w, i) => [w.key, h(x.weeks[i]!)])), worked: h(x.worked), normal: h(x.normal), night: h(x.night), overtime: h(x.overtime), absentHours: h(x.absentMinutes) }));
  rows.push({ name: "TOTAL", pause: h(r.totals.breakMinutes), ...Object.fromEntries(r.weeks.map((w, i) => [w.key, h(r.totals.weeks[i]!)])), worked: h(r.totals.worked), normal: h(r.totals.normal), night: h(r.totals.night), overtime: h(r.totals.overtime), absentDays: r.totals.absentDays, absentHours: h(r.totals.absentMinutes), primes: r.totals.primes, advances: r.totals.advances, transport: r.totals.transport } as never);
  const buf = await workbookBuffer([{ name: `Activité ${query.from} au ${query.to}`, columns, rows, groups }]);
  await log("EXPORT", "REPORT", null, { from: query.from, to: query.to, rows: r.rows.length });
  return fileResponse(buf, `rapport-activite-${query.from}-${query.to}.xlsx`);
});
