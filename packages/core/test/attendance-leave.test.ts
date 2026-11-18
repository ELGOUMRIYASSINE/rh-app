import { describe, expect, it } from "vitest";
import { assignPairsToDates, computeDayAttendance, liveStatus, pairPunches, weeklyOvertimeMinutes } from "../src/attendance";
import { checkLeaveRequest, completedMonthsBetween, computeBalance, countLeaveDays, type LeavePolicyDef } from "../src/leave";
import { moroccanHolidays } from "../src/holidays";
import { resolveAssignment, type ShiftTypeDef } from "../src/shifts";
import { toLocalMinutes } from "../src/time";
import { can } from "../src/permissions";

const types: ShiftTypeDef[] = [
  { id: "M", name: "Matin", code: "M", startTime: "07:00", endTime: "15:00", breakMinutes: 30, breakPaid: false, isNight: false },
  { id: "GN12", name: "Garde de nuit", code: "GN12", startTime: "19:00", endTime: "07:00", breakMinutes: 30, breakPaid: false, isNight: true },
];
const map = new Map(types.map((t) => [t.id, t]));
const t = (d: string, hm: string) => toLocalMinutes(d, hm);
const night = { start: "21:00", end: "06:00" };

describe("punch pairing", () => {
  it("dedupes double scans and pairs IN/OUT", () => {
    const pairs = pairPunches([t("2026-11-16", "07:05"), t("2026-11-16", "07:06"), t("2026-11-16", "15:02")]);
    expect(pairs).toEqual([{ in: t("2026-11-16", "07:05"), out: t("2026-11-16", "15:02") }]);
  });
  it("closes a pair with missing out after 16 h", () => {
    const pairs = pairPunches([t("2026-11-16", "07:00"), t("2026-11-17", "07:00"), t("2026-11-17", "15:00")]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.out).toBeNull();
  });
  it("a midnight-crossing shift belongs to its start day", () => {
    const shift = resolveAssignment({ id: "a", employeeId: "e", date: "2026-11-16", shiftTypeId: "GN12" }, map)!;
    const pairs = pairPunches([t("2026-11-16", "18:55"), t("2026-11-17", "07:10")]);
    const byDate = assignPairsToDates(pairs, [shift]);
    expect([...byDate.keys()]).toEqual(["2026-11-16"]);
    const day = computeDayAttendance({ date: "2026-11-16", shifts: [shift], pairs: byDate.get("2026-11-16")!, nightWindow: night, lateToleranceMinutes: 10 });
    // 18:55 → 07:10 = 12h15 − 30 min unpaid break = 11h45 ; night 9 h before break proration
    expect(day.workedMinutes).toBe(705);
    expect(day.lateMinutes).toBe(0);
    expect(day.status).toBe("DONE");
  });
});

describe("lateness tolerance", () => {
  const shift = resolveAssignment({ id: "a", employeeId: "e", date: "2026-11-16", shiftTypeId: "M" }, map)!;
  const run = (inAt: string) =>
    computeDayAttendance({ date: "2026-11-16", shifts: [shift], pairs: pairPunches([t("2026-11-16", inAt), t("2026-11-16", "15:00")]), nightWindow: night, lateToleranceMinutes: 10 });
  it("within tolerance is not late", () => expect(run("07:10").lateMinutes).toBe(0));
  it("above tolerance counts in full", () => {
    const d = run("07:25");
    expect(d.lateMinutes).toBe(25);
    expect(d.status).toBe("LATE");
  });
  it("planned without punch → absent once start + tolerance passed", () => {
    const d = computeDayAttendance({ date: "2026-11-16", shifts: [shift], pairs: [], nightWindow: night, lateToleranceMinutes: 10, now: t("2026-11-16", "07:30") });
    expect(d.status).toBe("ABSENT");
    const before = computeDayAttendance({ date: "2026-11-16", shifts: [shift], pairs: [], nightWindow: night, lateToleranceMinutes: 10, now: t("2026-11-16", "06:30") });
    expect(before.status).toBe("OFF");
  });
  it("missing out is flagged on closed days", () => {
    const d = computeDayAttendance({ date: "2026-11-16", shifts: [shift], pairs: [{ in: t("2026-11-16", "07:00"), out: null }], nightWindow: night, lateToleranceMinutes: 10 });
    expect(d.issues).toContain("MISSING_OUT");
  });
  it("live board", () => {
    expect(liveStatus([{ in: 1, out: null }], true, false, false)).toBe("PRESENT");
    expect(liveStatus([{ in: 1, out: 2 }], true, false, false)).toBe("ABSENT");
    expect(liveStatus([], false, true, false)).toBe("LEAVE");
  });
  it("weekly overtime above min(threshold, contract)", () => {
    expect(weeklyOvertimeMinutes(46 * 60, 44, 44)).toBe(120);
    expect(weeklyOvertimeMinutes(40 * 60, 44, 35)).toBe(300);
  });
});

describe("leave", () => {
  const holidays = moroccanHolidays(2026).map((h) => h.date);
  it("5-day request excluding a holiday (ouvrables)", () => {
    // Mon 16 → Sat 21 Nov 2026, 18 Nov = Fête de l'indépendance → 6 − 1 = 5
    expect(countLeaveDays({ startDate: "2026-11-16", endDate: "2026-11-21", method: "OUVRABLES", holidays })).toBe(5);
  });
  it("ouvrés excludes Saturday", () => {
    expect(countLeaveDays({ startDate: "2026-11-16", endDate: "2026-11-22", method: "OUVRES", holidays })).toBe(4);
  });
  it("half days", () => {
    expect(countLeaveDays({ startDate: "2026-11-23", endDate: "2026-11-24", method: "OUVRABLES", holidays, halfDayStart: true })).toBe(1.5);
    expect(countLeaveDays({ startDate: "2026-11-23", endDate: "2026-11-23", method: "OUVRABLES", holidays, halfDayStart: true, halfDayEnd: true })).toBe(0.5);
  });
  it("completed months", () => {
    expect(completedMonthsBetween("2026-01-01", "2026-01-31")).toBe(1);
    expect(completedMonthsBetween("2026-01-01", "2026-01-30")).toBe(0);
    expect(completedMonthsBetween("2026-01-15", "2026-03-14")).toBe(2);
    expect(completedMonthsBetween("2026-01-01", "2026-11-16")).toBe(10);
  });
  const policy: LeavePolicyDef = { leaveType: "PAID_LEAVE", enabled: true, countingMethod: "OUVRABLES", accruedPerMonth: 1.5, annualAllowance: 18, annualCap: 18, periodStart: "01-01", allowAdvanceFirstYear: false };
  it("Morocco accrual 1.5 d/month, capped at 18", () => {
    expect(computeBalance({ policy, hireDate: "2020-03-01", asOf: "2026-11-16", taken: 4 })).toMatchObject({ acquired: 15, taken: 4, available: 11 });
    expect(computeBalance({ policy, hireDate: "2020-03-01", asOf: "2026-12-31", taken: 0 }).acquired).toBe(18);
    expect(computeBalance({ policy, hireDate: "2026-09-01", asOf: "2026-11-16", taken: 0 }).acquired).toBe(3);
    expect(computeBalance({ policy: { ...policy, allowAdvanceFirstYear: true }, hireDate: "2026-09-01", asOf: "2026-11-16", taken: 0 }).acquired).toBe(18);
  });
  it("warns about balance, overlaps and planned shifts", () => {
    const c = checkLeaveRequest({
      days: 5,
      balance: { periodStart: "2026-01-01", acquired: 3, taken: 0, adjusted: 0, available: 3 },
      startDate: "2026-11-16",
      endDate: "2026-11-21",
      otherRequests: [{ startDate: "2026-11-20", endDate: "2026-11-22", status: "PENDING" }],
      plannedShiftDates: ["2026-11-17"],
    });
    expect(c.exceedsBalance).toBe(true);
    expect(c.overlapsRequest).toBe(true);
    expect(c.warnings).toHaveLength(3);
  });
});

describe("permissions", () => {
  it("chef limited to granted rights and subordinates", () => {
    const chef = { role: "CHEF" as const, permissions: { "leaves.approve": true }, subordinateIds: ["e1"] };
    expect(can(chef, "leaves.approve", "e1")).toBe(true);
    expect(can(chef, "leaves.approve", "e2")).toBe(false);
    expect(can(chef, "planning.manage", "e1")).toBe(false);
    expect(can({ role: "RH" }, "payroll.validate")).toBe(true);
    expect(can({ role: "SALARIE" }, "reports.view")).toBe(false);
  });
});
