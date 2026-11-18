import { fail, route } from "@/server/api";
import { canDo } from "@/server/context";
import { fileResponse } from "@/server/excel";
import { payslipPdfBuffer } from "@/server/pdf/payslip-pdf";

/** RH / leads with payroll rights, or the employee for their own LOCKED payslips. */
export const GET = route({ feature: "payroll", allowEmployee: true }, async ({ s, params, log }) => {
  const r = await payslipPdfBuffer(params.id!, s.org.id);
  if (!r) fail(404, "Bulletin introuvable.");
  const own = r!.employeeId === s.employeeId;
  if (own) {
    if (r!.periodStatus !== "LOCKED" && s.role === "SALARIE") fail(403, "Ce bulletin n'est pas encore disponible.");
  } else if (!canDo(s, "payroll.validate", r!.employeeId)) fail(403, "Accès refusé.");
  await log("EXPORT", "PAYSLIP", params.id, { pdf: true });
  return fileResponse(r!.buffer, r!.filename, "application/pdf");
});
