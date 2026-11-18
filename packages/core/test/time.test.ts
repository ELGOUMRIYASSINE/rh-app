import { describe, expect, it } from "vitest";
import {
  anchoredInterval,
  formatDuration,
  formatLongDateFr,
  isoWeek,
  isoWeeksInRange,
  nightMinutes,
  startOfIsoWeek,
  toLocalMinutes,
  weekday,
} from "../src/time";
import { amplitudeMinutes, endsNextDay, resolveAssignment, shiftDurationMinutes, splitShiftMinutes, type ShiftTypeDef } from "../src/shifts";

describe("dates", () => {
  it("weekday uses 0=Sunday", () => {
    expect(weekday("2026-11-16")).toBe(1); // Monday
    expect(weekday("2026-11-22")).toBe(0);
  });
  it("ISO weeks", () => {
    expect(isoWeek("2026-11-16")).toEqual({ year: 2026, week: 47 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(startOfIsoWeek("2026-11-22")).toBe("2026-11-16");
  });
  it("ISO weeks in a month range", () => {
    const weeks = isoWeeksInRange("2026-11-01", "2026-11-30");
    expect(weeks.map((w) => w.week)).toEqual([44, 45, 46, 47, 48, 49]);
  });
  it("long French date", () => {
    expect(formatLongDateFr("2026-11-16")).toBe("Lundi 16 novembre 2026");
  });
  it("formats durations", () => {
    expect(formatDuration(545)).toBe("9h05");
    expect(formatDuration(0)).toBe("0h00");
  });
});

describe("intervals & night", () => {
  it("anchors a midnight-crossing interval on its start day", () => {
    const i = anchoredInterval("2026-11-16", "19:00", "07:00");
    expect(i.start).toBe(toLocalMinutes("2026-11-16", "19:00"));
    expect(i.end).toBe(toLocalMinutes("2026-11-17", "07:00"));
  });
  it("night minutes for 19:00–07:00 with 21:00–06:00 window = 9 h", () => {
    expect(nightMinutes(anchoredInterval("2026-11-16", "19:00", "07:00"), "21:00", "06:00")).toBe(9 * 60);
  });
  it("night minutes for an early morning shift 04:00–12:00 = 2 h", () => {
    expect(nightMinutes(anchoredInterval("2026-11-16", "04:00", "12:00"), "21:00", "06:00")).toBe(120);
  });
  it("night minutes for a day shift = 0", () => {
    expect(nightMinutes(anchoredInterval("2026-11-16", "08:00", "17:00"), "21:00", "06:00")).toBe(0);
  });
  it("supports a non-crossing night window", () => {
    expect(nightMinutes(anchoredInterval("2026-11-16", "23:00", "07:00"), "00:00", "05:00")).toBe(300);
  });
});

describe("shift types", () => {
  const types: ShiftTypeDef[] = [
    { id: "g12", name: "Garde de 12 heures", code: "G12", startTime: "07:00", endTime: "19:00", breakMinutes: 60, breakPaid: false, isNight: false },
    { id: "gn12", name: "Garde de nuit de 12 heures", code: "GN12", startTime: "19:00", endTime: "07:00", breakMinutes: 30, breakPaid: false, isNight: true },
    { id: "n", name: "Nuit", code: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 0, breakPaid: false, isNight: true },
  ];
  it("duration = amplitude − unpaid break", () => {
    expect(shiftDurationMinutes(types[0]!)).toBe(660);
    expect(shiftDurationMinutes(types[1]!)).toBe(690);
    expect(shiftDurationMinutes({ ...types[0]!, breakPaid: true })).toBe(720);
  });
  it("end <= start ends next day", () => {
    expect(endsNextDay("19:00", "07:00")).toBe(true);
    expect(endsNextDay("07:00", "07:00")).toBe(true);
    expect(amplitudeMinutes("07:00", "07:00")).toBe(1440);
    expect(endsNextDay("07:00", "19:00")).toBe(false);
  });
  it("resolves and splits a night assignment", () => {
    const map = new Map(types.map((t) => [t.id, t]));
    const r = resolveAssignment({ id: "a", employeeId: "e", date: "2026-11-16", shiftTypeId: "n" }, map)!;
    expect(r.duration).toBe(480);
    expect(r.isNight).toBe(true);
    expect(splitShiftMinutes(r, "21:00", "06:00")).toEqual({ normal: 60, night: 420 });
  });
  it("custom hours override the shift type", () => {
    const map = new Map(types.map((t) => [t.id, t]));
    const r = resolveAssignment({ id: "a", employeeId: "e", date: "2026-11-16", shiftTypeId: "g12", customStart: "09:00", customEnd: "13:00", breakMinutes: 0 }, map)!;
    expect(r.duration).toBe(240);
  });
});
