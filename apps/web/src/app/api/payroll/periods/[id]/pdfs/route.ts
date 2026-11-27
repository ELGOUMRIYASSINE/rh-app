import JSZip from "jszip";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { fileResponse } from "@/server/excel";
import { payslipPdfBuffer } from "@/server/pdf/payslip-pdf";

export const GET = route({ feature: "payroll", permission: "payroll.validate" }, async ({ s, params, log }) => {
  const p = await prisma.payrollPeriod.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { payslips: { select: { id: true } } } });
  if (!p) fail(404, "Période introuvable.");
  if (!p!.payslips.length) fail(400, "Calculez la période avant de télécharger les bulletins.");
  const zip = new JSZip();
  for (const ps of p!.payslips) {
    const r = await payslipPdfBuffer(ps.id, s.org.id);
    if (r) zip.file(r.filename, r.buffer);
  }
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await log("EXPORT", "PAYROLLPERIOD", p!.id, { pdfs: p!.payslips.length });
  return fileResponse(buf, `bulletins-${p!.year}-${String(p!.month).padStart(2, "0")}.zip`, "application/zip");
});
