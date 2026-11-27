import { resolveRule, ruleEnabled, type Severity, type WorkRuleDef, type WorkRuleType } from "./rules";
import { resolveAssignment, type AssignmentDef, type ResolvedShift, type ShiftTypeDef } from "./shifts";
import {
  addDays,
  dayIndex,
  type DateStr,
  eachDay,
  formatDuration,
  isoWeeksInRange,
  minutesOfDay,
  weekday,
} from "./time";

export type AnomalyType =
  | "MAX_WEEKLY_HOURS"
  | "MAX_SHIFT_HOURS"
  | "MAX_DAILY_HOURS"
  | "MIN_SHIFT_HOURS"
  | "BREAK_REQUIRED"
  | "MIN_REST_BETWEEN_SHIFTS"
  | "MIN_REST_AFTER_NIGHT"
  | "WEEKLY_REST_DAYS"
  | "MAX_CONSECUTIVE_NIGHTS"
  | "MAX_CONSECUTIVE_WORK_DAYS"
  | "NIGHT_THEN_MORNING"
  | "OVERTIME_WEEKLY"
  | "MAX_OVERTIME_MONTHLY"
  | "OVERLAPPING_SHIFTS"
  | "SHIFT_DURING_LEAVE"
  | "SHIFT_DURING_UNAVAILABILITY"
  | "COVERAGE_EMPTY"
  | "COVERAGE_UNDER"
  | "COVERAGE_OVER";

export const ANOMALY_TITLES: Record<AnomalyType, string> = {
  MAX_WEEKLY_HOURS: "Durée hebdomadaire dépassée",
  MAX_SHIFT_HOURS: "Shift trop long",
  MAX_DAILY_HOURS: "Durée journalière dépassée",
  MIN_SHIFT_HOURS: "Shift trop court",
  BREAK_REQUIRED: "Pause insuffisante",
  MIN_REST_BETWEEN_SHIFTS: "Repos insuffisant entre deux shifts",
  MIN_REST_AFTER_NIGHT: "Repos insuffisant après une nuit",
  WEEKLY_REST_DAYS: "Repos hebdomadaire insuffisant",
  MAX_CONSECUTIVE_NIGHTS: "Trop de nuits consécutives",
  MAX_CONSECUTIVE_WORK_DAYS: "Trop de jours consécutifs travaillés",
  NIGHT_THEN_MORNING: "Nuit suivie d'un matin",
  OVERTIME_WEEKLY: "Heures supplémentaires",
  MAX_OVERTIME_MONTHLY: "Plafond mensuel d'heures sup. dépassé",
  OVERLAPPING_SHIFTS: "Shifts qui se chevauchent",
  SHIFT_DURING_LEAVE: "Shift pendant un congé",
  SHIFT_DURING_UNAVAILABILITY: "Shift pendant une indisponibilité",
  COVERAGE_EMPTY: "Shift sans personnel",
  COVERAGE_UNDER: "Sous-effectif",
  COVERAGE_OVER: "Sureffectif",
};

export interface Anomaly {
  key: string;
  ruleId?: string;
  type: AnomalyType;
  title: string;
  severity: Severity;
  exceptionAllowed: boolean;
  date: DateStr;
  employeeId?: string;
  shiftTypeId?: string;
  message: string;
  advice: string;
  exceptionId?: string;
}

export interface PlanningEmployee {
  id: string;
  name: string;
  staffCategoryId?: string | null;
  serviceId?: string | null;
  weeklyHours?: number | null;
}

export interface CoverageRuleDef {
  id: string;
  shiftTypeId: string;
  serviceId: string | null;
  staffCategoryId: string | null;
  min: number;
  max: number | null;
  /** 0=Sun..6=Sat; empty = every day */
  days: number[];
  severity: Severity;
  active: boolean;
  label?: string | null;
}

export interface DateRangeItem {
  employeeId: string;
  startDate: DateStr;
  endDate: DateStr;
  label?: string;
}

export interface PlanningAnalysisInput {
  from: DateStr;
  to: DateStr;
  employees: PlanningEmployee[];
  shiftTypes: ShiftTypeDef[];
  /** Should include ~7 days of context before `from` and after `to` for rest / streak checks. */
  assignments: AssignmentDef[];
  rules: WorkRuleDef[];
  coverageRules: CoverageRuleDef[];
  leaves?: DateRangeItem[];
  unavailabilities?: DateRangeItem[];
  exceptions?: { id: string; anomalyKey: string }[];
  nightWindow?: { start: string; end: string };
  categoryNames?: Record<string, string>;
  serviceNames?: Record<string, string>;
}

const BLOCKING_ALWAYS: Severity = "BLOCKING";

function inRange(date: DateStr, from: DateStr, to: DateStr): boolean {
  const d = dayIndex(date);
  return d >= dayIndex(from) && d <= dayIndex(to);
}

function covers(item: DateRangeItem, date: DateStr): boolean {
  return inRange(date, item.startDate, item.endDate);
}

function h(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `${String(v).replace(".", ",")} h`;
}

/**
 * Read-only planning control: returns every anomaly in [from, to].
 * The planning is never modified.
 */
export function analyzePlanning(input: PlanningAnalysisInput): Anomaly[] {
  const night = input.nightWindow ?? { start: "21:00", end: "06:00" };
  const stMap = new Map(input.shiftTypes.map((s) => [s.id, s]));
  const exceptionByKey = new Map((input.exceptions ?? []).map((e) => [e.anomalyKey, e.id]));
  const out: Anomaly[] = [];

  const push = (a: Omit<Anomaly, "title" | "exceptionId" | "key"> & { keySuffix: string }) => {
    if (!inRange(a.date, input.from, input.to)) return;
    const { keySuffix, ...rest } = a;
    const key = `${a.type}:${a.date}:${keySuffix}`;
    if (out.some((x) => x.key === key)) return;
    out.push({ ...rest, key, title: ANOMALY_TITLES[a.type], exceptionId: exceptionByKey.get(key) });
  };

  const fromRule = (rule: WorkRuleDef) => ({ ruleId: rule.id, severity: rule.severity, exceptionAllowed: rule.exceptionAllowed });

  // Resolve every assignment once.
  const shiftsByEmployee = new Map<string, ResolvedShift[]>();
  for (const a of input.assignments) {
    const r = resolveAssignment(a, stMap, night);
    if (!r) continue;
    const list = shiftsByEmployee.get(a.employeeId) ?? [];
    list.push(r);
    shiftsByEmployee.set(a.employeeId, list);
  }

  // ---------- Per employee ----------
  for (const emp of input.employees) {
    const shifts = (shiftsByEmployee.get(emp.id) ?? []).sort((a, b) => a.interval.start - b.interval.start);
    const cat = emp.staffCategoryId ?? null;
    const rule = (t: WorkRuleType) => {
      const r = resolveRule(input.rules, t, cat);
      return ruleEnabled(r) ? r : undefined;
    };

    const maxShift = rule("MAX_SHIFT_HOURS");
    const minShift = rule("MIN_SHIFT_HOURS");
    const breakAfter = rule("BREAK_REQUIRED_AFTER_HOURS");
    const minBreak = rule("MIN_BREAK_MINUTES");
    const restBetween = rule("MIN_REST_BETWEEN_SHIFTS_HOURS");
    const restNight = rule("MIN_REST_AFTER_NIGHT_HOURS");
    const nightMorning = rule("FORBID_NIGHT_THEN_MORNING");

    for (const s of shifts) {
      const hours = s.amplitude / 60;
      if (maxShift && hours > (maxShift.value ?? Infinity)) {
        push({ type: "MAX_SHIFT_HOURS", ...fromRule(maxShift), date: s.date, employeeId: emp.id, shiftTypeId: s.shiftTypeId ?? undefined, keySuffix: `${emp.id}:${s.assignmentId}`,
          message: `${emp.name} : shift « ${s.name} » du ${s.date} de ${h(hours)} (maximum ${h(maxShift.value!)}).`,
          advice: "Raccourcissez le shift ou répartissez-le sur deux personnes." });
      }
      if (minShift && hours < (minShift.value ?? 0)) {
        push({ type: "MIN_SHIFT_HOURS", ...fromRule(minShift), date: s.date, employeeId: emp.id, keySuffix: `${emp.id}:${s.assignmentId}`,
          message: `${emp.name} : shift « ${s.name} » du ${s.date} de ${h(hours)} (minimum ${h(minShift.value!)}).`,
          advice: "Allongez le shift ou regroupez-le avec un autre créneau." });
      }
      if (breakAfter && hours > (breakAfter.value ?? Infinity)) {
        const required = minBreak?.value ?? 1;
        if (s.breakMinutes < required) {
          const r = minBreak ?? breakAfter;
          push({ type: "BREAK_REQUIRED", ...fromRule(r), date: s.date, employeeId: emp.id, keySuffix: `${emp.id}:${s.assignmentId}`,
            message: `${emp.name} : shift « ${s.name} » du ${s.date} de ${h(hours)} avec ${s.breakMinutes} min de pause (minimum ${required} min au-delà de ${h(breakAfter.value!)}).`,
            advice: "Ajoutez une pause au shift." });
        }
      }
    }

    // Consecutive shift pairs: overlap, rest, night → morning
    for (let i = 1; i < shifts.length; i++) {
      const prev = shifts[i - 1]!;
      const cur = shifts[i]!;
      const gap = cur.interval.start - prev.interval.end;
      if (gap < 0) {
        push({ type: "OVERLAPPING_SHIFTS", ruleId: undefined, severity: BLOCKING_ALWAYS, exceptionAllowed: false, date: cur.date, employeeId: emp.id, keySuffix: `${emp.id}:${prev.assignmentId}:${cur.assignmentId}`,
          message: `${emp.name} : les shifts « ${prev.name} » (${prev.date}) et « ${cur.name} » (${cur.date}) se chevauchent.`,
          advice: "Supprimez ou déplacez l'un des deux shifts." });
        continue;
      }
      // DECISION: after a night shift, the night-specific rule replaces the general rest rule.
      if (prev.isNight && restNight) {
        if (gap < restNight.value! * 60) {
          push({ type: "MIN_REST_AFTER_NIGHT", ...fromRule(restNight), date: cur.date, employeeId: emp.id, keySuffix: `${emp.id}:${cur.assignmentId}`,
            message: `${emp.name} : ${formatDuration(gap)} de repos après la nuit du ${prev.date} (minimum ${h(restNight.value!)}).`,
            advice: `Décalez le shift « ${cur.name} » du ${cur.date} ou accordez un repos après la nuit.` });
        }
      } else if (restBetween && gap < restBetween.value! * 60) {
        push({ type: "MIN_REST_BETWEEN_SHIFTS", ...fromRule(restBetween), date: cur.date, employeeId: emp.id, keySuffix: `${emp.id}:${cur.assignmentId}`,
          message: `${emp.name} : ${formatDuration(gap)} de repos entre le shift du ${prev.date} et celui du ${cur.date} (minimum ${h(restBetween.value!)}).`,
          advice: "Décalez l'un des deux shifts pour respecter le repos minimum." });
      }
      if (nightMorning && prev.isNight && !cur.isNight && gap < 24 * 60 && minutesOfDay(cur.interval.start) < 12 * 60) {
        push({ type: "NIGHT_THEN_MORNING", ...fromRule(nightMorning), date: cur.date, employeeId: emp.id, keySuffix: `${emp.id}:${cur.assignmentId}`,
          message: `${emp.name} : shift du matin « ${cur.name} » le ${cur.date} juste après la nuit du ${prev.date}.`,
          advice: "Remplacez le matin par un repos ou un shift d'après-midi." });
      }
    }

    // Per day (paid minutes, attached to the start date)
    const byDate = new Map<DateStr, ResolvedShift[]>();
    for (const s of shifts) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

    const maxDaily = rule("MAX_DAILY_HOURS");
    if (maxDaily) {
      for (const [date, list] of byDate) {
        const hours = list.reduce((t, s) => t + s.duration, 0) / 60;
        if (hours > maxDaily.value!) {
          push({ type: "MAX_DAILY_HOURS", ...fromRule(maxDaily), date, employeeId: emp.id, keySuffix: emp.id,
            message: `${emp.name} : ${h(hours)} planifiées le ${date} (maximum ${h(maxDaily.value!)}).`,
            advice: "Retirez un shift de cette journée." });
        }
      }
    }

    // Leave / unavailability overlaps
    for (const s of shifts) {
      const leave = (input.leaves ?? []).find((l) => l.employeeId === emp.id && covers(l, s.date));
      if (leave) {
        push({ type: "SHIFT_DURING_LEAVE", severity: "BLOCKING", exceptionAllowed: true, date: s.date, employeeId: emp.id, keySuffix: `${emp.id}:${s.assignmentId}`,
          message: `${emp.name} est en congé${leave.label ? ` (${leave.label})` : ""} le ${s.date} mais a un shift « ${s.name} ».`,
          advice: "Supprimez le shift ou réaffectez-le à un collègue." });
      }
      const unav = (input.unavailabilities ?? []).find((u) => u.employeeId === emp.id && covers(u, s.date));
      if (unav) {
        push({ type: "SHIFT_DURING_UNAVAILABILITY", severity: "WARNING", exceptionAllowed: true, date: s.date, employeeId: emp.id, keySuffix: `${emp.id}:${s.assignmentId}`,
          message: `${emp.name} s'est déclaré(e) indisponible le ${s.date} mais a un shift « ${s.name} ».`,
          advice: "Vérifiez avec le salarié ou réaffectez le shift." });
      }
    }

    // Streaks: consecutive nights / consecutive worked days
    const maxNights = rule("MAX_CONSECUTIVE_NIGHTS");
    const maxDays = rule("MAX_CONSECUTIVE_WORK_DAYS");
    if (maxNights || maxDays) {
      const dates = [...byDate.keys()].sort();
      if (dates.length) {
        let nightStreak = 0;
        let workStreak = 0;
        for (const date of eachDay(dates[0]!, dates[dates.length - 1]!)) {
          const list = byDate.get(date) ?? [];
          workStreak = list.length ? workStreak + 1 : 0;
          nightStreak = list.some((s) => s.isNight) ? nightStreak + 1 : 0;
          if (maxNights && nightStreak > maxNights.value!) {
            push({ type: "MAX_CONSECUTIVE_NIGHTS", ...fromRule(maxNights), date, employeeId: emp.id, keySuffix: emp.id,
              message: `${emp.name} : ${nightStreak} nuits consécutives au ${date} (maximum ${maxNights.value}).`,
              advice: "Insérez un repos ou un shift de jour dans la série." });
          }
          if (maxDays && workStreak > maxDays.value!) {
            push({ type: "MAX_CONSECUTIVE_WORK_DAYS", ...fromRule(maxDays), date, employeeId: emp.id, keySuffix: emp.id,
              message: `${emp.name} : ${workStreak} jours travaillés d'affilée au ${date} (maximum ${maxDays.value}).`,
              advice: "Accordez un jour de repos dans la série." });
          }
        }
      }
    }

    // Weekly checks (ISO weeks overlapping the range)
    const maxWeekly = rule("MAX_WEEKLY_HOURS");
    const restDays = rule("WEEKLY_REST_DAYS");
    const otAuto = rule("OVERTIME_AUTO_DETECT");
    const otThreshold = rule("OVERTIME_WEEKLY_THRESHOLD_HOURS");
    for (const w of isoWeeksInRange(input.from, input.to)) {
      const weekShifts = shifts.filter((s) => inRange(s.date, w.start, w.end));
      const hours = weekShifts.reduce((t, s) => t + s.duration, 0) / 60;
      const reportDate = dayIndex(w.start) < dayIndex(input.from) ? input.from : w.start;
      const weekLabel = `S${String(w.week).padStart(2, "0")}`;
      if (maxWeekly && hours > maxWeekly.value!) {
        push({ type: "MAX_WEEKLY_HOURS", ...fromRule(maxWeekly), date: reportDate, employeeId: emp.id, keySuffix: `${emp.id}:${w.key}`,
          message: `${emp.name} : ${h(hours)} planifiées en ${weekLabel} (maximum ${h(maxWeekly.value!)}).`,
          advice: "Retirez ou raccourcissez un shift dans la semaine." });
      }
      if (restDays && weekShifts.length > 0) {
        const worked = new Set(weekShifts.map((s) => s.date)).size;
        const rest = 7 - worked;
        if (rest < restDays.value!) {
          push({ type: "WEEKLY_REST_DAYS", ...fromRule(restDays), date: reportDate, employeeId: emp.id, keySuffix: `${emp.id}:${w.key}`,
            message: `${emp.name} : ${rest} jour(s) de repos en ${weekLabel} (minimum ${restDays.value}).`,
            advice: "Libérez une journée complète dans la semaine." });
        }
      }
      if (otAuto && weekShifts.length > 0) {
        const threshold = otThreshold?.value ?? emp.weeklyHours ?? 44;
        const contract = emp.weeklyHours ?? threshold;
        const limit = Math.min(threshold, contract);
        if (hours > limit) {
          push({ type: "OVERTIME_WEEKLY", ...fromRule(otThreshold ?? otAuto), date: reportDate, employeeId: emp.id, keySuffix: `${emp.id}:${w.key}`,
            message: `${emp.name} : ${h(hours - limit)} d'heures supplémentaires en ${weekLabel} (${h(hours)} pour ${h(limit)}).`,
            advice: "Vérifiez que ces heures supplémentaires sont voulues : elles seront majorées en paie." });
        }
      }
    }
  }

  // ---------- Coverage per shift × day ----------
  const empMap = new Map(input.employees.map((e) => [e.id, e]));
  const resolvedAll = [...shiftsByEmployee.values()].flat();
  for (const cr of input.coverageRules.filter((c) => c.active)) {
    const st = stMap.get(cr.shiftTypeId);
    if (!st) continue;
    const scope = [
      cr.staffCategoryId ? (input.categoryNames?.[cr.staffCategoryId] ?? "catégorie").toLowerCase() : null,
      cr.serviceId ? `service ${input.serviceNames?.[cr.serviceId] ?? ""}`.trim() : null,
    ].filter(Boolean).join(", ");
    for (const date of eachDay(input.from, input.to)) {
      if (cr.days.length && !cr.days.includes(weekday(date))) continue;
      const count = resolvedAll.filter((s) => {
        if (s.date !== date || s.shiftTypeId !== cr.shiftTypeId) return false;
        const e = empMap.get(s.employeeId);
        if (!e) return false;
        if (cr.serviceId && e.serviceId !== cr.serviceId) return false;
        if (cr.staffCategoryId && e.staffCategoryId !== cr.staffCategoryId) return false;
        if ((input.leaves ?? []).some((l) => l.employeeId === e.id && covers(l, date))) return false;
        return true;
      }).length;
      const scopeTxt = scope ? ` (${scope})` : "";
      const base = { ruleId: cr.id, severity: cr.severity, exceptionAllowed: true, date, shiftTypeId: cr.shiftTypeId, keySuffix: `${cr.id}` };
      if (count === 0 && cr.min > 0) {
        push({ type: "COVERAGE_EMPTY", ...base,
          message: `Shift « ${st.name} » du ${date} : personne d'affecté (minimum ${cr.min})${scopeTxt}.`,
          advice: `Affectez au moins ${cr.min} personne(s) à ce shift.` });
      } else if (count < cr.min) {
        push({ type: "COVERAGE_UNDER", ...base,
          message: `Shift « ${st.name} » du ${date} : ${count} personne(s) affectée(s) pour un minimum de ${cr.min}${scopeTxt}.`,
          advice: `Ajoutez ${cr.min - count} personne(s) à ce shift.` });
      } else if (cr.max !== null && count > cr.max) {
        push({ type: "COVERAGE_OVER", ...base,
          message: `Shift « ${st.name} » du ${date} : ${count} personne(s) affectée(s) pour un maximum de ${cr.max}${scopeTxt}.`,
          advice: `Retirez ${count - cr.max} personne(s) ou déplacez-les sur un autre shift.` });
      }
    }
  }

  return out.sort((a, b) => (a.date === b.date ? (a.severity === b.severity ? 0 : a.severity === "BLOCKING" ? -1 : 1) : a.date < b.date ? -1 : 1));
}

/** Publishing is blocked by any blocking anomaly without an approved exception. */
export function blockingAnomalies(anomalies: Anomaly[]): Anomaly[] {
  return anomalies.filter((a) => a.severity === "BLOCKING" && !a.exceptionId);
}

/** Expand a range to the full ISO weeks around it plus a week of context, for rest/streak rules. */
export function analysisContextRange(from: DateStr, to: DateStr): { from: DateStr; to: DateStr } {
  return { from: addDays(from, -7 - ((weekday(from) + 6) % 7)), to: addDays(to, 7) };
}
