import type { Severity, WorkRuleType } from "@yghr/core";

export interface RuleRow { id: string; type: WorkRuleType; staffCategoryId: string | null; value: number | null; boolValue: boolean | null; severity: Severity; exceptionAllowed: boolean; active: boolean; updatedAt: string; updatedBy: { firstName: string; lastName: string } | null }
export interface ShiftRow { id: string; name: string; code: string; color: string; startTime: string; endTime: string; breakMinutes: number; breakPaid: boolean; isNight: boolean; staffCategoryId: string | null; active: boolean }
export interface CategoryRow { id: string; name: string; code: string; description: string | null; active: boolean; count: number }
export interface ServiceRow { id: string; name: string; active: boolean; count: number }
export interface CoverageRow { id: string; shiftTypeId: string; serviceId: string | null; staffCategoryId: string | null; min: number; max: number | null; days: number[]; severity: Severity; active: boolean; label: string | null }
export interface RotationRow { id: string; name: string; unit: "DAY" | "WEEK"; sequence: string[]; workDays: number[]; active: boolean; assignments: { id: string; label: string; startDate: string; endDate: string | null }[] }

export const DAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
/** Fixed categorical palette for shift colours (contrast-checked on white and dark). */
export const SHIFT_COLORS = ["#14808C", "#F2A541", "#1F9D6B", "#3B82F6", "#6D4AFF", "#D64545", "#0F4C55", "#C2410C"];

export function daysLabel(days: number[]) {
  if (!days.length) return "Tous les jours";
  const s = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (s.join() === "1,2,3,4,5") return "Lun–Ven";
  if (s.join() === "6,0") return "Week-end";
  return s.map((d) => DAY_SHORT[d]).join(", ");
}
