import { z } from "zod";
import { prisma } from "@yghr/db";
import { auditWhere } from "@/server/audit-query";
import { route } from "@/server/api";

const ACTIONS = ["LOGIN", "LOGIN_FAILED", "LOGOUT", "CREATE", "UPDATE", "DELETE", "VALIDATE", "PUBLISH", "EXPORT", "IMPORT", "APPROVE", "REJECT", "LOCK", "UNLOCK", "CALCULATE"] as const;

export const GET = route({ feature: "audit", permission: "audit.view", query: z.object({ q: z.string().optional(), action: z.enum([...ACTIONS, "ALL"]).optional(), page: z.coerce.number().int().min(1).default(1) }) }, async ({ s, query }) => {
  const where = auditWhere(s.org.id, query.q, query.action);
  const size = 50;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * size, take: size, include: { user: { select: { firstName: true, lastName: true, email: true, memberships: { where: { organizationId: s.org.id }, select: { role: true } } } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    total, page: query.page, pages: Math.max(1, Math.ceil(total / size)),
    items: items.map((i) => ({ id: i.id, createdAt: i.createdAt.toISOString(), action: i.action, entity: i.entity, entityId: i.entityId, details: i.details, ip: i.ip, userAgent: i.userAgent, user: i.user ? { name: `${i.user.firstName} ${i.user.lastName}`, email: i.user.email, role: i.user.memberships[0]?.role ?? null } : null })),
  };
});
