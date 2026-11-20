export type Severity = "BLOCKING" | "WARNING";

export const WORK_RULE_TYPES = [
  "MAX_WEEKLY_HOURS",
  "MAX_SHIFT_HOURS",
  "MAX_DAILY_HOURS",
  "MIN_SHIFT_HOURS",
  "BREAK_REQUIRED_AFTER_HOURS",
  "MIN_BREAK_MINUTES",
  "MIN_REST_BETWEEN_SHIFTS_HOURS",
  "MIN_REST_AFTER_NIGHT_HOURS",
  "WEEKLY_REST_DAYS",
  "MAX_CONSECUTIVE_NIGHTS",
  "MAX_CONSECUTIVE_WORK_DAYS",
  "FORBID_NIGHT_THEN_MORNING",
  "OVERTIME_AUTO_DETECT",
  "OVERTIME_WEEKLY_THRESHOLD_HOURS",
  "MAX_OVERTIME_MONTHLY_HOURS",
  "DETECT_ABSENCES",
  "LATE_TOLERANCE_MINUTES",
  "EARLY_LEAVE_TOLERANCE_MINUTES",
] as const;
export type WorkRuleType = (typeof WORK_RULE_TYPES)[number];

export type RuleUnit = "h" | "min" | "jour" | "nombre" | "bool";
export type RuleGroup = "Durée de travail" | "Temps de repos" | "Règles de nuit" | "Heures supplémentaires" | "Pointage réel";

export interface RuleTypeMeta {
  label: string;
  group: RuleGroup;
  unit: RuleUnit;
  examples: (number | boolean)[];
  description: string;
}

export const RULE_TYPE_META: Record<WorkRuleType, RuleTypeMeta> = {
  MAX_WEEKLY_HOURS: { label: "Durée maximale de travail par semaine", group: "Durée de travail", unit: "h", examples: [44, 48, 60], description: "Total des heures planifiées sur une semaine ISO (lundi → dimanche)." },
  MAX_SHIFT_HOURS: { label: "Durée maximale d'un shift", group: "Durée de travail", unit: "h", examples: [10, 12, 24], description: "Amplitude maximale d'un seul shift." },
  MAX_DAILY_HOURS: { label: "Durée maximale par jour", group: "Durée de travail", unit: "h", examples: [10, 12], description: "Total des heures planifiées sur une même journée." },
  MIN_SHIFT_HOURS: { label: "Durée minimale d'un shift", group: "Durée de travail", unit: "h", examples: [3, 4], description: "Un shift plus court est signalé." },
  BREAK_REQUIRED_AFTER_HOURS: { label: "Pause obligatoire au-delà de", group: "Durée de travail", unit: "h", examples: [6], description: "Au-delà de cette amplitude, le shift doit comporter une pause." },
  MIN_BREAK_MINUTES: { label: "Durée minimale de la pause", group: "Durée de travail", unit: "min", examples: [20, 30, 60], description: "Durée minimale de pause quand une pause est obligatoire." },
  MIN_REST_BETWEEN_SHIFTS_HOURS: { label: "Repos minimum entre deux shifts", group: "Temps de repos", unit: "h", examples: [11, 12], description: "Temps minimum entre la fin d'un shift et le début du suivant." },
  MIN_REST_AFTER_NIGHT_HOURS: { label: "Repos minimum après un shift de nuit", group: "Temps de repos", unit: "h", examples: [11, 24, 48], description: "Temps minimum après un shift de nuit. Prioritaire sur le repos entre deux shifts." },
  WEEKLY_REST_DAYS: { label: "Jours de repos obligatoires par semaine", group: "Temps de repos", unit: "jour", examples: [1, 2], description: "Nombre minimum de jours sans shift par semaine ISO." },
  MAX_CONSECUTIVE_NIGHTS: { label: "Nombre maximum de nuits consécutives", group: "Règles de nuit", unit: "nombre", examples: [2, 3, 4], description: "Nombre maximum de shifts de nuit d'affilée." },
  MAX_CONSECUTIVE_WORK_DAYS: { label: "Nombre max de jours consécutifs travaillés", group: "Temps de repos", unit: "nombre", examples: [5, 6], description: "Nombre maximum de jours travaillés d'affilée." },
  FORBID_NIGHT_THEN_MORNING: { label: "Interdire nuit puis matin", group: "Règles de nuit", unit: "bool", examples: [true], description: "Interdit un shift du matin (début avant 12:00) dans les 24 h qui suivent la fin d'une nuit." },
  OVERTIME_AUTO_DETECT: { label: "Détection automatique des heures sup.", group: "Heures supplémentaires", unit: "bool", examples: [true], description: "Signale les semaines qui dépassent la durée contractuelle." },
  OVERTIME_WEEKLY_THRESHOLD_HOURS: { label: "Seuil d'heures sup. par semaine", group: "Heures supplémentaires", unit: "h", examples: [44, 40], description: "Au-delà, les heures de la semaine sont des heures supplémentaires." },
  MAX_OVERTIME_MONTHLY_HOURS: { label: "Max heures sup. par mois", group: "Heures supplémentaires", unit: "h", examples: [20, 30], description: "Plafond mensuel d'heures supplémentaires planifiées." },
  DETECT_ABSENCES: { label: "Détecter les absences", group: "Pointage réel", unit: "bool", examples: [true], description: "Signale les salariés planifiés sans pointage d'entrée." },
  LATE_TOLERANCE_MINUTES: { label: "Retard toléré", group: "Pointage réel", unit: "min", examples: [5, 10, 15], description: "Un retard n'est compté qu'au-delà de cette tolérance." },
  EARLY_LEAVE_TOLERANCE_MINUTES: { label: "Sortie anticipée tolérée", group: "Pointage réel", unit: "min", examples: [5, 10], description: "Une sortie anticipée n'est comptée qu'au-delà de cette tolérance." },
};

export interface WorkRuleDef {
  id: string;
  type: WorkRuleType;
  staffCategoryId: string | null;
  value: number | null;
  boolValue: boolean | null;
  severity: Severity;
  exceptionAllowed: boolean;
  active: boolean;
}

/**
 * Rule precedence: a category-specific active rule overrides the general active rule
 * of the same type. Inactive rules are ignored.
 */
export function resolveRule(rules: WorkRuleDef[], type: WorkRuleType, staffCategoryId: string | null | undefined): WorkRuleDef | undefined {
  const active = rules.filter((r) => r.active && r.type === type);
  if (staffCategoryId) {
    const specific = active.find((r) => r.staffCategoryId === staffCategoryId);
    if (specific) return specific;
  }
  return active.find((r) => r.staffCategoryId === null);
}

export function ruleEnabled(rule: WorkRuleDef | undefined): rule is WorkRuleDef {
  if (!rule) return false;
  if (RULE_TYPE_META[rule.type].unit === "bool") return rule.boolValue === true;
  return rule.value !== null && rule.value !== undefined;
}

export function formatRuleValue(type: WorkRuleType, value: number | null, boolValue: boolean | null): string {
  const unit = RULE_TYPE_META[type].unit;
  if (unit === "bool") return boolValue ? "Oui" : "Non";
  if (value === null) return "Non défini";
  const v = Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
  switch (unit) {
    case "h":
      return `${v} h`;
    case "min":
      return `${v} min`;
    case "jour":
      return `${v} jour${value > 1 ? "s" : ""}`;
    default:
      return v;
  }
}
