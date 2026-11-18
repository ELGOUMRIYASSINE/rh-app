import "server-only";
import { z } from "zod";
import { prisma } from "@yghr/db";
import { RULE_TYPE_META, WORK_RULE_TYPES } from "@yghr/core";
import { fail, zTime } from "./api";

const optId = z.string().min(1).nullable().optional();

export const WorkRuleSchema = z.object({
  type: z.enum(WORK_RULE_TYPES),
  staffCategoryId: optId,
  value: z.number().min(0).max(10000).nullable().optional(),
  boolValue: z.boolean().nullable().optional(),
  severity: z.enum(["BLOCKING", "WARNING"]),
  exceptionAllowed: z.boolean().default(true),
  active: z.boolean().default(true),
});
export async function mapWorkRule(d: Record<string, unknown>, _org: string, userId: string) {
  const out: Record<string, unknown> = { ...d, updatedById: userId };
  if (d.type) {
    const meta = RULE_TYPE_META[d.type as keyof typeof RULE_TYPE_META];
    out.unit = meta.unit;
    if (meta.unit === "bool") {
      out.value = null;
      out.boolValue = d.boolValue ?? true;
    } else {
      if (d.value === null || d.value === undefined) fail(400, "Valeur requise pour ce type de règle.");
      out.boolValue = null;
    }
  }
  return out;
}

export const ShiftTypeSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  code: z.string().trim().min(1, "Code requis").max(8).transform((v) => v.toUpperCase()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
  startTime: zTime,
  endTime: zTime,
  breakMinutes: z.number().int().min(0).max(240),
  breakPaid: z.boolean(),
  isNight: z.boolean(),
  staffCategoryId: optId,
  active: z.boolean().default(true),
});

export const CategorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
  code: z.string().trim().min(1, "Code requis").max(8).transform((v) => v.toUpperCase()),
  description: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().default(true),
});

export const ServiceSchema = z.object({ name: z.string().trim().min(1, "Nom requis").max(80), active: z.boolean().default(true), centreId: optId });

export const CoverageSchema = z.object({
  shiftTypeId: z.string().min(1, "Shift requis"),
  serviceId: optId,
  staffCategoryId: optId,
  min: z.number().int().min(0).max(500),
  max: z.number().int().min(0).max(500).nullable().optional(),
  days: z.array(z.number().int().min(0).max(6)).default([]),
  severity: z.enum(["BLOCKING", "WARNING"]),
  active: z.boolean().default(true),
  label: z.string().trim().max(120).nullable().optional(),
});

export const RotationSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
  unit: z.enum(["DAY", "WEEK"]),
  sequence: z.array(z.string().min(1)).min(1, "Ajoutez au moins une étape"),
  workDays: z.array(z.number().int().min(0).max(6)).min(1, "Choisissez au moins un jour"),
  active: z.boolean().default(true),
});

/** Check that every referenced id belongs to the organisation. */
export async function checkRefs(d: Record<string, unknown>, organizationId: string) {
  const checks: Promise<unknown>[] = [];
  if (d.staffCategoryId) checks.push(prisma.staffCategory.findFirstOrThrow({ where: { id: d.staffCategoryId as string, organizationId } }));
  if (d.serviceId) checks.push(prisma.service.findFirstOrThrow({ where: { id: d.serviceId as string, organizationId } }));
  if (d.shiftTypeId) checks.push(prisma.shiftType.findFirstOrThrow({ where: { id: d.shiftTypeId as string, organizationId } }));
  if (d.centreId) checks.push(prisma.centre.findFirstOrThrow({ where: { id: d.centreId as string, organizationId } }));
  if (Array.isArray(d.sequence)) {
    const ids = (d.sequence as string[]).filter((x) => x !== "REST");
    const n = await prisma.shiftType.count({ where: { id: { in: ids }, organizationId } });
    if (n !== new Set(ids).size) fail(400, "Séquence invalide.");
  }
  try {
    await Promise.all(checks);
  } catch {
    fail(400, "Référence invalide.");
  }
}

export const CentreSchema = z.object({ name: z.string().trim().min(2, "Nom requis").max(80), address: z.string().trim().max(200).nullable().optional(), active: z.boolean().default(true) });
export const TabletSchema = z.object({ name: z.string().trim().min(2, "Nom requis").max(60), centreId: optId, active: z.boolean().default(true) });
