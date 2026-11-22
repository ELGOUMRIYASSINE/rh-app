import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { readSheet } from "@/server/excel";
import { validateRows } from "@/server/import";
import { placeholderEmail, provisionAccess } from "@/server/employees";

/** multipart: file (.xlsx|.csv), dryRun ("1" = preview only). */
export const POST = route({ feature: "employees", permission: "team.add" }, async ({ s, req, log }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail(400, "Fichier manquant.");
  const f = file as File;
  if (!/\.(xlsx|csv)$/i.test(f.name)) fail(400, "Format non pris en charge : utilisez un fichier .xlsx ou .csv.");
  if (f.size > 5 * 1024 * 1024) fail(400, "Fichier trop volumineux (5 Mo maximum).");
  const raw = await readSheet(f).catch(() => fail(400, "Impossible de lire ce fichier. Partez du modèle Excel."));
  if (!raw.length) fail(400, "Le fichier ne contient aucune ligne.");
  if (raw.length > 2000) fail(400, "2 000 lignes maximum par import.");
  const existing = new Set((await prisma.employee.findMany({ where: { organizationId: s.org.id }, select: { email: true } })).map((e) => e.email.toLowerCase()));
  const accounts = s.org.features.includes("employee_accounts");
  const rows = validateRows(raw, existing, { emailRequired: false });
  if (form.get("dryRun") === "1") {
    return { rows, valid: rows.filter((r) => !r.errors.length && !r.duplicate).length, invalid: rows.filter((r) => r.errors.length).length, duplicates: rows.filter((r) => r.duplicate).length };
  }
  // DECISION: unknown "Département" values create the service on the fly.
  const services = new Map((await prisma.service.findMany({ where: { organizationId: s.org.id } })).map((x) => [x.name.toLowerCase(), x.id]));
  let created = 0;
  let invited = 0;
  const failures: { line: number; error: string }[] = [];
  for (const r of rows) {
    if (r.errors.length || r.duplicate) continue;
    try {
      let serviceId: string | null = null;
      if (r.data.service) {
        serviceId = services.get(r.data.service.toLowerCase()) ?? null;
        if (!serviceId) {
          serviceId = (await prisma.service.create({ data: { organizationId: s.org.id, name: r.data.service } })).id;
          services.set(r.data.service.toLowerCase(), serviceId);
        }
      }
      const d = r.data;
      const emp = await prisma.employee.create({
        data: {
          organizationId: s.org.id, firstName: d.firstName, lastName: d.lastName, email: d.email || placeholderEmail(s.org.slug), phone: d.phone, position: d.position, serviceId, contractType: d.contractType,
          hourlyRate: d.hourlyRate, netHourlyRate: d.netHourlyRate, birthDate: d.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : null, hireDate: d.hireDate ? new Date(`${d.hireDate}T00:00:00Z`) : null,
          cnssNumber: d.cnssNumber, matricule: d.matricule, teamLeadId: s.role === "CHEF" ? s.employeeId : null,
        },
      });
      const acc = !accounts || emp.email.endsWith(".invalid") ? { invited: false } : await provisionAccess({ organizationId: s.org.id, orgName: s.org.name, employeeId: emp.id, email: emp.email, firstName: emp.firstName, lastName: emp.lastName, password: d.password });
      created++;
      if (acc.invited) invited++;
    } catch (e) {
      failures.push({ line: r.line, error: (e as Error).message.slice(0, 120) });
    }
  }
  await log("IMPORT", "EMPLOYEE", null, { file: f.name, created, invited, skipped: rows.length - created });
  return { created, invited, skipped: rows.length - created - failures.length, failures };
});
