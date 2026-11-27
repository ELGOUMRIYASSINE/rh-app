import { monthNameFr } from "@yghr/core";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { fileResponse, workbookBuffer } from "@/server/excel";

/** Journal de paie + CNSS declaration helper (DAMANCOM-ready columns). */
export const GET = route({ feature: "payroll", permission: "payroll.validate" }, async ({ s, params, log }) => {
  const p = await prisma.payrollPeriod.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { payslips: { include: { employee: true } } } });
  if (!p) fail(404, "Période introuvable.");
  const rows = p!.payslips.sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName)).map((x) => {
    const ec = x.employerCharges as Record<string, number>;
    const h = x.hours as Record<string, number>;
    return {
      matricule: x.employee.matricule, name: `${x.employee.lastName} ${x.employee.firstName}`, cnss: x.employee.cnssNumber, cin: x.employee.cin,
      hours: Math.round(((h.normalMinutes ?? 0) + (h.overtimeDayMinutes ?? 0) + (h.overtimeNightMinutes ?? 0) + (h.restDayDayMinutes ?? 0) + (h.restDayNightMinutes ?? 0)) / 6) / 10,
      gross: x.gross.toNumber(), cnssEmp: x.cnssEmployee.toNumber(), ipe: x.ipeEmployee.toNumber(), amo: x.amoEmployee.toNumber(), fp: x.profExpenses.toNumber(), ni: x.taxableNet.toNumber(), ir: x.ir.toNumber(), net: x.net.toNumber(),
      ecCnss: ec.cnss, ecAf: ec.familyAllowance, ecAmo: (ec.amo ?? 0) + (ec.amoSolidarity ?? 0), ecIpe: ec.ipe, ecTfp: ec.trainingTax, ecTotal: ec.total,
      cnssBase: Math.min(x.gross.toNumber(), 6000), days: Math.min(26, Math.round(((h.normalMinutes ?? 0) / 60 / 8) * 10) / 10),
    };
  });
  const m = "#,##0.00";
  const buf = await workbookBuffer([
    { name: "Journal de paie", columns: [
      { header: "Matricule", key: "matricule" }, { header: "Nom", key: "name", width: 26 }, { header: "Heures", key: "hours" }, { header: "Brut", key: "gross", numFmt: m }, { header: "CNSS", key: "cnssEmp", numFmt: m }, { header: "IPE", key: "ipe", numFmt: m }, { header: "AMO", key: "amo", numFmt: m },
      { header: "Frais pro.", key: "fp", numFmt: m }, { header: "Net imposable", key: "ni", numFmt: m }, { header: "IR", key: "ir", numFmt: m }, { header: "Net à payer", key: "net", numFmt: m },
      { header: "CNSS pat.", key: "ecCnss", numFmt: m }, { header: "Alloc. fam.", key: "ecAf", numFmt: m }, { header: "AMO pat.", key: "ecAmo", numFmt: m }, { header: "IPE pat.", key: "ecIpe", numFmt: m }, { header: "TFP", key: "ecTfp", numFmt: m }, { header: "Total patronal", key: "ecTotal", numFmt: m },
    ], rows },
    { name: "Déclaration CNSS", columns: [
      { header: "N° immatriculation", key: "cnss", width: 18 }, { header: "Nom et prénom", key: "name", width: 26 }, { header: "CIN", key: "cin" }, { header: "Jours déclarés", key: "days" }, { header: "Salaire réel brut", key: "gross", numFmt: m }, { header: "Salaire plafonné", key: "cnssBase", numFmt: m },
    ], rows },
  ]);
  await log("EXPORT", "PAYROLLPERIOD", p!.id, { journal: true });
  return fileResponse(buf, `journal-paie-${p!.year}-${String(p!.month).padStart(2, "0")}-${monthNameFr(p!.month)}.xlsx`);
});
