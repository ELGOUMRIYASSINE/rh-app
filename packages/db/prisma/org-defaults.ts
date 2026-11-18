import { RULE_TYPE_META, type WorkRuleType } from "@yghr/core";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Starting configuration of a new organisation (section 7.11 seeds): staff categories, services,
 * shift types, work rules and the Moroccan leave policy. Everything stays editable in Paramètres.
 */
export async function applyOrgDefaults(db: PrismaClient, organizationId: string, rhUserId: string) {
  const O = organizationId;
  const cat: Record<string, string> = {};
  for (const [name, code, description] of [
    ["Infirmières", "INF", "Personnel infirmier diplômé d'État"],
    ["Personnel de sécurité", "SEC", "Agents de sécurité et d'accueil"],
    ["Personnel médical", "MED", "Médecins et internes"],
    ["Responsable de service", "RSV", "Cadres de santé et responsables"],
    ["Salariés administratifs", "ADM", "Accueil, RH, comptabilité"],
  ] as const) cat[code] = (await db.staffCategory.create({ data: { organizationId: O, name, code, description } })).id;

  const svc: Record<string, string> = {};
  for (const name of ["Administration & RH", "Bloc opératoire", "Pédiatrie", "Urgences"]) svc[name] = (await db.service.create({ data: { organizationId: O, name } })).id;

  const st: Record<string, string> = {};
  for (const [name, code, s, e, brk, c, color] of [
    ["Garde de 12 heures", "G12", "07:00", "19:00", 60, null, "#14808C"],
    ["Matin", "M", "07:00", "15:00", 30, "INF", "#F2A541"],
    ["Journée", "J", "08:00", "17:00", 60, "ADM", "#1F9D6B"],
    ["Après-midi", "AM", "15:00", "23:00", 30, "INF", "#3B82F6"],
    ["Garde de nuit de 12 heures", "GN12", "19:00", "07:00", 30, null, "#6D4AFF"],
    ["Nuit", "N", "23:00", "07:00", 0, null, "#0F4C55"],
  ] as const) {
    st[code] = (await db.shiftType.create({ data: { organizationId: O, name, code, startTime: s, endTime: e, breakMinutes: brk, breakPaid: false, isNight: code === "GN12" || code === "N", staffCategoryId: c ? cat[c]! : null, color } })).id;
  }

  const rules: [string | null, WorkRuleType, number | null, boolean | null, "BLOCKING" | "WARNING", boolean][] = [
    [null, "MAX_WEEKLY_HOURS", 48, null, "BLOCKING", true],
    [null, "MAX_SHIFT_HOURS", 12, null, "WARNING", true],
    [null, "BREAK_REQUIRED_AFTER_HOURS", 6, null, "WARNING", true],
    [null, "MIN_BREAK_MINUTES", 30, null, "WARNING", true],
    [null, "MIN_REST_BETWEEN_SHIFTS_HOURS", 11, null, "BLOCKING", true],
    ["INF", "MIN_REST_AFTER_NIGHT_HOURS", 24, null, "BLOCKING", true],
    [null, "WEEKLY_REST_DAYS", 1, null, "WARNING", true],
    ["INF", "MAX_CONSECUTIVE_NIGHTS", 3, null, "BLOCKING", true],
    [null, "FORBID_NIGHT_THEN_MORNING", null, true, "BLOCKING", true],
    [null, "OVERTIME_AUTO_DETECT", null, true, "WARNING", true],
    [null, "OVERTIME_WEEKLY_THRESHOLD_HOURS", 44, null, "WARNING", true],
    [null, "DETECT_ABSENCES", null, true, "WARNING", false],
    [null, "LATE_TOLERANCE_MINUTES", 10, null, "WARNING", true],
  ];
  for (const [c, type, value, boolValue, severity, active] of rules) {
    await db.workRule.create({ data: { organizationId: O, staffCategoryId: c ? cat[c]! : null, type, value, boolValue, unit: RULE_TYPE_META[type].unit, severity, exceptionAllowed: true, active, updatedById: rhUserId } });
  }

  await db.leavePolicy.createMany({
    data: [
      { organizationId: O, leaveType: "PAID_LEAVE", enabled: true, countingMethod: "OUVRABLES", accruedPerMonth: 1.5, annualAllowance: 18, annualCap: 18, periodStart: "01-01" },
      { organizationId: O, leaveType: "RTT", enabled: false, countingMethod: "OUVRES", accruedPerMonth: null, annualAllowance: 10, annualCap: 10, periodStart: "01-01" },
      { organizationId: O, leaveType: "REPOS_COMPENSATEUR", enabled: false, countingMethod: "OUVRES", accruedPerMonth: null, annualAllowance: null, annualCap: null, periodStart: "01-01" },
    ],
  });
  return { cat, svc, st };
}
