import { dayIndex, type DateStr, eachDay, startOfIsoWeek, weekday } from "./time";

export type RotationStep = string | "REST";

export interface RotationDef {
  unit: "DAY" | "WEEK";
  /** shiftTypeId or "REST" */
  sequence: RotationStep[];
  /** 0=Sun..6=Sat — days on which the rotation proposes a shift. */
  workDays: number[];
}

/**
 * Which step of the cycle applies on `date` for a rotation anchored on `anchor`.
 * - DAY: one step per worked day (non-worked days don't advance the cycle).
 * - WEEK: one step per ISO week.
 */
export function rotationStepFor(def: RotationDef, anchor: DateStr, date: DateStr): RotationStep | null {
  if (!def.sequence.length || dayIndex(date) < dayIndex(anchor)) return null;
  if (!def.workDays.includes(weekday(date))) return null;
  let idx: number;
  if (def.unit === "WEEK") {
    idx = Math.floor((dayIndex(startOfIsoWeek(date)) - dayIndex(startOfIsoWeek(anchor))) / 7);
  } else {
    idx = eachDay(anchor, date).filter((d) => def.workDays.includes(weekday(d))).length - 1;
  }
  return def.sequence[idx % def.sequence.length] ?? null;
}

export interface DraftCell {
  employeeId: string;
  date: DateStr;
  shiftTypeId: string;
}

/** Proposed DRAFT cells for employees over a range. "REST" steps produce no cell. */
export function generateRotationDraft(
  def: RotationDef,
  anchor: DateStr,
  employeeIds: string[],
  from: DateStr,
  to: DateStr,
  endDate?: DateStr | null,
): DraftCell[] {
  const cells: DraftCell[] = [];
  for (const date of eachDay(from, to)) {
    if (endDate && dayIndex(date) > dayIndex(endDate)) break;
    const step = rotationStepFor(def, anchor, date);
    if (!step || step === "REST") continue;
    for (const employeeId of employeeIds) cells.push({ employeeId, date, shiftTypeId: step });
  }
  return cells;
}
