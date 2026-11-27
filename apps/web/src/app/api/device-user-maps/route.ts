import { z } from "zod";
import { mapDeviceUser, prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { emit } from "@/server/realtime";

/** Mapped IDs, plus unmapped fingerprint IDs seen in punches (count, last seen). */
export const GET = route({ feature: "devices", rhOnly: true }, async ({ s }) => {
  const maps = await prisma.deviceUserMap.findMany({ where: { organizationId: s.org.id }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { deviceUserId: "asc" } });
  const unmapped = await prisma.punch.groupBy({ by: ["deviceUserId"], where: { organizationId: s.org.id, employeeId: null, deviceUserId: { not: null }, deletedAt: null }, _count: true, _max: { timestamp: true } });
  return {
    maps: maps.map((m) => ({ id: m.id, deviceUserId: m.deviceUserId, employeeId: m.employeeId, employee: `${m.employee.firstName} ${m.employee.lastName}` })),
    unmapped: unmapped.map((u) => ({ deviceUserId: u.deviceUserId!, count: u._count, lastSeen: u._max.timestamp?.toISOString() ?? null })).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "")),
  };
});

export const POST = route({ feature: "devices", rhOnly: true, body: z.object({ deviceUserId: z.string().trim().min(1).max(20), employeeId: z.string() }) }, async ({ s, body, log }) => {
  if (!(await prisma.employee.count({ where: { id: body.employeeId, organizationId: s.org.id } }))) fail(400, "Salarié inconnu.");
  const other = await prisma.deviceUserMap.findFirst({ where: { organizationId: s.org.id, employeeId: body.employeeId, deviceUserId: { not: body.deviceUserId } } });
  const backfilled = await mapDeviceUser(prisma, s.org.id, body.deviceUserId, body.employeeId);
  await emit(s.org.id, "attendance:update", {});
  await log("CREATE", "DEVICE_USER_MAP", body.deviceUserId, { employeeId: body.employeeId, backfilled });
  return { ok: true, backfilled, warning: other ? `Ce salarié est aussi associé à l'ID ${other.deviceUserId}.` : null };
});

export const DELETE = route({ feature: "devices", rhOnly: true, query: z.object({ id: z.string() }) }, async ({ s, query, log }) => {
  const m = await prisma.deviceUserMap.findFirst({ where: { id: query.id, organizationId: s.org.id } });
  if (!m) fail(404, "Association introuvable.");
  await prisma.deviceUserMap.delete({ where: { id: m!.id } });
  await log("DELETE", "DEVICE_USER_MAP", m!.deviceUserId);
  return { ok: true };
});
