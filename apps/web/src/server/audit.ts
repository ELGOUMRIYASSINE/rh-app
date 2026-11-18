import "server-only";
import { prisma } from "@yghr/db";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VALIDATE"
  | "PUBLISH"
  | "EXPORT"
  | "IMPORT"
  | "APPROVE"
  | "REJECT"
  | "LOCK"
  | "UNLOCK"
  | "CALCULATE";

export async function audit(e: {
  organizationId: string | null;
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: e.organizationId,
        userId: e.userId,
        action: e.action,
        entity: e.entity.toUpperCase(),
        entityId: e.entityId ?? null,
        details: e.details === undefined ? undefined : JSON.parse(JSON.stringify(e.details)),
        ip: e.ip ?? null,
        userAgent: e.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}

/** Log a change to rules / shifts / categories / rotations / coverage / exceptions (Historique tab). */
export async function ruleChange(organizationId: string, userId: string, entity: string, entityId: string, action: "CREATE" | "UPDATE" | "DELETE", before: unknown, after: unknown) {
  await prisma.ruleChangeLog.create({
    data: {
      organizationId,
      userId,
      entity,
      entityId,
      action,
      before: before === null || before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      after: after === null || after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
    },
  });
}
