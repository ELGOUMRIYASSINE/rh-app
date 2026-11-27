import "server-only";
import type { ZodObject, ZodRawShape } from "zod";
import { prisma } from "@yghr/db";
import type { FeatureKey } from "@yghr/core";
import { fail, route } from "./api";
import { ruleChange } from "./audit";

type Delegate = {
  findMany: (a: object) => Promise<unknown[]>;
  findFirst: (a: object) => Promise<Record<string, unknown> | null>;
  create: (a: object) => Promise<{ id: string }>;
  update: (a: object) => Promise<{ id: string }>;
  delete: (a: object) => Promise<unknown>;
};

interface CrudOpts<S extends ZodRawShape> {
  model: "workRule" | "shiftType" | "staffCategory" | "service" | "coverageRule" | "rotation" | "centre" | "tablet";
  entity: string; // for audit & history, e.g. "WORK_RULE"
  schema: ZodObject<S>;
  feature?: FeatureKey;
  orderBy?: object;
  include?: object;
  /** Write to RuleChangeLog (Historique tab). */
  history?: boolean;
  /** Transform validated input before writing. */
  map?: (data: Record<string, unknown>, orgId: string, userId: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Validate referenced ids belong to the org. */
  refs?: (data: Record<string, unknown>, orgId: string) => Promise<void>;
  beforeDelete?: (id: string, orgId: string) => Promise<void>;
}

const db = (m: string) => (prisma as unknown as Record<string, Delegate>)[m]!;

/** GET (list) + POST (create) for a tenant-scoped settings entity, with audit and history. */
export function collection<S extends ZodRawShape>(o: CrudOpts<S>) {
  const GET = route({ feature: o.feature, permission: "settings.manage" }, async ({ s }) => ({
    items: await db(o.model).findMany({ where: { organizationId: s.org.id }, orderBy: o.orderBy ?? { createdAt: "asc" }, include: o.include }),
  }));
  const POST = route({ feature: o.feature, permission: "settings.manage", body: o.schema }, async ({ s, body, log }) => {
    const raw = body as Record<string, unknown>;
    await o.refs?.(raw, s.org.id);
    const data = o.map ? await o.map(raw, s.org.id, s.userId) : raw;
    const created = await db(o.model).create({ data: { ...data, organizationId: s.org.id } });
    if (o.history) await ruleChange(s.org.id, s.userId, o.entity, created.id, "CREATE", null, created);
    await log("CREATE", o.entity, created.id, data);
    return { item: created };
  });
  return { GET, POST };
}

/** PATCH + DELETE for one item; the org id is always part of the where clause. */
export function item<S extends ZodRawShape>(o: CrudOpts<S>) {
  const PATCH = route({ feature: o.feature, permission: "settings.manage", body: o.schema.partial() }, async ({ s, body, params, log }) => {
    const before = await db(o.model).findFirst({ where: { id: params.id, organizationId: s.org.id } });
    if (!before) fail(404, "Élément introuvable.");
    const raw = body as Record<string, unknown>;
    await o.refs?.(raw, s.org.id);
    const data = o.map ? await o.map(raw, s.org.id, s.userId) : raw;
    const updated = await db(o.model).update({ where: { id: params.id, organizationId: s.org.id }, data });
    if (o.history) await ruleChange(s.org.id, s.userId, o.entity, params.id!, "UPDATE", before, updated);
    await log("UPDATE", o.entity, params.id, { before, after: data });
    return { item: updated };
  });
  const DELETE = route({ feature: o.feature, permission: "settings.manage" }, async ({ s, params, log }) => {
    const before = await db(o.model).findFirst({ where: { id: params.id, organizationId: s.org.id } });
    if (!before) fail(404, "Élément introuvable.");
    await o.beforeDelete?.(params.id!, s.org.id);
    await db(o.model).delete({ where: { id: params.id, organizationId: s.org.id } });
    if (o.history) await ruleChange(s.org.id, s.userId, o.entity, params.id!, "DELETE", before, null);
    await log("DELETE", o.entity, params.id, before);
    return { ok: true };
  });
  return { PATCH, DELETE };
}
