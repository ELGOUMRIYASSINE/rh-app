import { prisma } from "@yghr/db";
import { route } from "@/server/api";

/** People the current user can message: active members of the organisation. */
export const GET = route({ feature: "messaging", allowEmployee: true }, async ({ s }) => {
  const ms = await prisma.membership.findMany({ where: { organizationId: s.org.id, active: true, userId: { not: s.userId } }, include: { user: { select: { id: true, firstName: true, lastName: true } }, employee: { select: { position: true } } } });
  const ROLE: Record<string, string> = { RH: "Responsable RH", CHEF: "Chef d'équipe", SALARIE: "Salarié" };
  return { items: ms.map((m) => ({ userId: m.userId, name: `${m.user.firstName} ${m.user.lastName}`, subtitle: m.employee?.position ?? ROLE[m.role] ?? "" })).sort((a, b) => a.name.localeCompare(b.name)) };
});
