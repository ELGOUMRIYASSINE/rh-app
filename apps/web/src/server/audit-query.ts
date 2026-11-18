import "server-only";
import type { Prisma } from "@yghr/db";

export function auditWhere(orgId: string, q?: string, action?: string): Prisma.AuditLogWhereInput {
  return {
    organizationId: orgId,
    ...(action && action !== "ALL" ? { action } : {}),
    ...(q ? { OR: [{ entity: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }, { ip: { contains: q } }, { user: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } }] } : {}),
  };
}

