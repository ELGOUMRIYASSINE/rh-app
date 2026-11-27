import { prisma, fromDbDate } from "@yghr/db";
import { route } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { fileResponse, workbookBuffer } from "@/server/excel";

export const GET = route({ feature: "employees", permission: "data.export" }, async ({ s, req, log }) => {
  const scope = scopeEmployeeIds(s);
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean);
  const emps = await prisma.employee.findMany({
    where: { organizationId: s.org.id, ...(scope ? { id: { in: scope } } : {}), ...(ids?.length ? { id: { in: ids } } : {}) },
    include: { service: true, staffCategory: true, teamLead: true },
    orderBy: { lastName: "asc" },
  });
  const rates = canDo(s, "rates.view");
  const buf = await workbookBuffer([{
    name: "Salariés",
    columns: [
      { header: "Matricule", key: "matricule" }, { header: "Nom", key: "lastName", width: 18 }, { header: "Prénom", key: "firstName", width: 18 }, { header: "Email", key: "email", width: 30 },
      { header: "Téléphone", key: "phone", width: 16 }, { header: "Poste", key: "position", width: 22 }, { header: "Service", key: "service", width: 20 }, { header: "Catégorie", key: "category", width: 22 },
      { header: "Chef d'équipe", key: "lead", width: 20 }, { header: "Contrat", key: "contractType" }, { header: "Durée hebdo", key: "weeklyHours" },
      ...(rates ? [{ header: "Taux horaire", key: "hourlyRate", numFmt: "#,##0.00" }, { header: "Base mensuelle", key: "monthlyBase", numFmt: "#,##0.00" }] : []),
      { header: "Date d'embauche", key: "hireDate", width: 14 }, { header: "N° CNSS", key: "cnssNumber", width: 14 }, { header: "Statut", key: "status" },
    ],
    rows: emps.map((e) => ({ ...e, service: e.service?.name, category: e.staffCategory?.name, lead: e.teamLead ? `${e.teamLead.firstName} ${e.teamLead.lastName}` : "", weeklyHours: e.weeklyHours?.toNumber(), hourlyRate: e.hourlyRate?.toNumber(), monthlyBase: e.monthlyBase?.toNumber(), hireDate: e.hireDate ? fromDbDate(e.hireDate) : "", status: e.status === "ACTIVE" ? "Actif" : "Archivé" })),
  }]);
  await log("EXPORT", "EMPLOYEE", null, { count: emps.length });
  return fileResponse(buf, `salaries-${s.org.slug}.xlsx`);
});
