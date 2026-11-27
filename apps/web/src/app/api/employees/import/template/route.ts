import { route } from "@/server/api";
import { fileResponse, workbookBuffer } from "@/server/excel";
import { IMPORT_COLUMNS } from "@/server/import";

export const GET = route({ feature: "employees", permission: "team.add" }, async () => {
  const buf = await workbookBuffer([{
    name: "Salariés",
    columns: IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) })),
    rows: [{ firstName: "Salma", lastName: "Idrissi", email: "salma.idrissi@exemple.ma", phone: "06 12 34 56 78", position: "Infirmière", service: "Urgences", contractType: "CDI", hourlyRate: 45, netHourlyRate: "", birthDate: "15/03/1990", hireDate: "01/09/2021", cnssNumber: "123456789", matricule: "M0001", password: "" }],
  }]);
  return fileResponse(buf, "modele-import-salaries.xlsx");
});
