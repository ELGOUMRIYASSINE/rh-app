import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const GET = route({ feature: "devices", rhOnly: true }, async ({ s }) => {
  const names = new Map((await prisma.deviceUser.findMany({ where: { organizationId: s.org.id, name: { not: null } }, select: { deviceUserId: true, name: true } })).map((u) => [u.deviceUserId, u.name!]));
  const items = await prisma.punch.findMany({ where: { organizationId: s.org.id, deletedAt: null }, orderBy: { timestamp: "desc" }, take: 100, include: { employee: { select: { id: true, firstName: true, lastName: true } }, device: { select: { name: true } } } });
  return { items: items.map((p) => ({ id: p.id, at: p.timestamp.toISOString(), receivedAt: p.receivedAt.toISOString(), employee: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : null, employeeId: p.employeeId, deviceUserId: p.deviceUserId, deviceName: p.deviceUserId ? (names.get(p.deviceUserId) ?? null) : null, state: p.state, device: p.device?.name ?? null, source: p.source, verifyMode: p.verifyMode, direction: p.direction })) };
});
