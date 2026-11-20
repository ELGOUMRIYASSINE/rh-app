import { z } from "zod";
import { PLAN_SEEDS } from "@yghr/core";
import { prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";

const Patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  planName: z.string().optional(),
  status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED"]).optional(),
  trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  internalNote: z.string().max(5000).nullable().optional(),
});

export const PATCH = platformRoute({ body: Patch }, async ({ body, params, log }) => {
  const org = await prisma.organization.findUnique({ where: { id: params.id! } });
  if (!org) fail(404, "Clinique introuvable.");
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.internalNote !== undefined) data.internalNote = body.internalNote || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.trialEndsAt !== undefined) data.trialEndsAt = body.trialEndsAt ? new Date(`${body.trialEndsAt}T23:59:59Z`) : null;
  if (body.planName) {
    const seed = PLAN_SEEDS.find((p) => p.name === body.planName);
    if (!seed) fail(400, "Pack inconnu.");
    const plan = await prisma.plan.upsert({ where: { name: seed!.name }, create: { name: seed!.name, features: seed!.features }, update: {} });
    data.planId = plan.id;
  }
  await prisma.organization.update({ where: { id: org!.id }, data });
  const action = body.status === "SUSPENDED" ? "SUSPEND" : "UPDATE";
  await log(org!.id, action, "ORGANIZATION", org!.id, body);
  return { ok: true };
});

/** Permanently delete a clinic and all its data. The slug must be typed to confirm. */
export const DELETE = platformRoute({ body: z.object({ confirm: z.string() }) }, async ({ body, params, log }) => {
  const org = await prisma.organization.findUnique({ where: { id: params.id! } });
  if (!org) fail(404, "Clinique introuvable.");
  if (body.confirm !== org!.slug) fail(400, `Tapez « ${org!.slug} » pour confirmer.`);
  await log(null, "DELETE", "ORGANIZATION", org!.id, { name: org!.name, slug: org!.slug });
  await prisma.organization.delete({ where: { id: org!.id } });
  return { ok: true };
});
