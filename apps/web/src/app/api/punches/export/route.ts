import { z } from "zod";
import { prisma } from "@yghr/db";
import { route } from "@/server/api";
import { workbookBuffer } from "@/server/excel";

/** Every clock-in of a period, with the employee, the name stored in the clock, the device, type and verification. */
export const GET = route({ feature: "devices", rhOnly: true, query: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) }, async ({ s, query, log }) => {
  const from = new Date(`${query.from}T00:00:00Z`);
  const to = new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 2 * 86400_000);
  const [punches, users] = await Promise.all([
    prisma.punch.findMany({ where: { organizationId: s.org.id, deletedAt: null, timestamp: { gte: new Date(from.getTime() - 86400_000), lt: to } }, orderBy: { timestamp: "asc" }, include: { employee: { select: { firstName: true, lastName: true, matricule: true, service: { select: { name: true } }, centre: { select: { name: true } } } }, device: { select: { name: true } } } }),
    prisma.deviceUser.findMany({ where: { organizationId: s.org.id }, select: { deviceUserId: true, name: true } }),
  ]);
  const nameBy = new Map(users.filter((u) => u.name).map((u) => [u.deviceUserId, u.name!]));
  const dfmt = new Intl.DateTimeFormat("fr-CA", { timeZone: s.org.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const tfmt = new Intl.DateTimeFormat("fr-FR", { timeZone: s.org.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const rows = punches
    .map((p) => ({ p, day: dfmt.format(p.timestamp) }))
    .filter(({ day }) => day >= query.from && day <= query.to)
    .map(({ p, day }) => ({
      date: day, time: tfmt.format(p.timestamp),
      employee: p.employee ? `${p.employee.lastName} ${p.employee.firstName}` : "Non associé",
      matricule: p.employee?.matricule ?? "", service: p.employee?.service?.name ?? "", centre: p.employee?.centre?.name ?? "",
      pin: p.deviceUserId ?? "", deviceName: p.deviceUserId ? (nameBy.get(p.deviceUserId) ?? "") : "",
      device: p.device?.name ?? (p.source === "TABLET" ? "Tablette" : p.source === "CORRECTION" ? "Correction RH" : ""),
      state: p.state ?? (p.direction === "IN" ? "Entrée" : p.direction === "OUT" ? "Sortie" : ""), verify: p.verifyMode ?? "", workCode: p.workCode ?? "",
    }));
  const buf = await workbookBuffer([{
    name: "Pointages",
    columns: [
      { header: "Date", key: "date", width: 12 }, { header: "Heure", key: "time", width: 10 }, { header: "Salarié", key: "employee", width: 28 }, { header: "Matricule", key: "matricule" },
      { header: "Service", key: "service", width: 20 }, { header: "Centre", key: "centre", width: 20 }, { header: "ID pointeuse", key: "pin" }, { header: "Nom sur la pointeuse", key: "deviceName", width: 24 },
      { header: "Pointeuse", key: "device", width: 20 }, { header: "Type", key: "state", width: 18 }, { header: "Vérification", key: "verify", width: 14 }, { header: "Code travail", key: "workCode" },
    ],
    rows,
  }]);
  await log("EXPORT", "PUNCH", null, { from: query.from, to: query.to, count: rows.length });
  return new Response(buf as unknown as BodyInit, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="pointages-${query.from}-au-${query.to}.xlsx"` } });
});
