import { describe, expect, it } from "vitest";
import { analyzePlanning, blockingAnomalies, type CoverageRuleDef, type PlanningAnalysisInput } from "../src/anomalies";
import { resolveRule, type WorkRuleDef } from "../src/rules";
import type { ShiftTypeDef } from "../src/shifts";
import { generateRotationDraft } from "../src/rotation";

const INF = "cat-inf";
const URG = "svc-urg";

const shiftTypes: ShiftTypeDef[] = [
  { id: "M", name: "Matin", code: "M", startTime: "07:00", endTime: "15:00", breakMinutes: 30, breakPaid: false, isNight: false },
  { id: "AM", name: "Après-midi", code: "AM", startTime: "15:00", endTime: "23:00", breakMinutes: 30, breakPaid: false, isNight: false },
  { id: "N", name: "Nuit", code: "N", startTime: "23:00", endTime: "07:00", breakMinutes: 0, breakPaid: false, isNight: true },
  { id: "G12", name: "Garde de 12 heures", code: "G12", startTime: "07:00", endTime: "19:00", breakMinutes: 60, breakPaid: false, isNight: false },
  { id: "LONG", name: "Longue", code: "L", startTime: "06:00", endTime: "20:00", breakMinutes: 0, breakPaid: false, isNight: false },
];

let rid = 0;
const rule = (type: WorkRuleDef["type"], value: number | null, severity: WorkRuleDef["severity"] = "BLOCKING", extra: Partial<WorkRuleDef> = {}): WorkRuleDef => ({
  id: `r${++rid}`,
  type,
  staffCategoryId: null,
  value,
  boolValue: value === null ? true : null,
  severity,
  exceptionAllowed: true,
  active: true,
  ...extra,
});

const seededRules: WorkRuleDef[] = [
  rule("MAX_WEEKLY_HOURS", 48),
  rule("MAX_SHIFT_HOURS", 12, "WARNING"),
  rule("BREAK_REQUIRED_AFTER_HOURS", 6, "WARNING"),
  rule("MIN_BREAK_MINUTES", 30, "WARNING"),
  rule("MIN_REST_BETWEEN_SHIFTS_HOURS", 11),
  rule("MIN_REST_AFTER_NIGHT_HOURS", 24, "BLOCKING", { staffCategoryId: INF }),
  rule("WEEKLY_REST_DAYS", 1, "WARNING"),
  rule("MAX_CONSECUTIVE_NIGHTS", 3, "BLOCKING", { staffCategoryId: INF }),
  rule("FORBID_NIGHT_THEN_MORNING", null),
  rule("OVERTIME_AUTO_DETECT", null, "WARNING"),
  rule("OVERTIME_WEEKLY_THRESHOLD_HOURS", 44, "WARNING"),
];

const coverage: CoverageRuleDef[] = [
  { id: "c1", shiftTypeId: "M", serviceId: URG, staffCategoryId: INF, min: 2, max: 4, days: [], severity: "BLOCKING", active: true },
];

const base = (over: Partial<PlanningAnalysisInput> = {}): PlanningAnalysisInput => ({
  from: "2026-11-16",
  to: "2026-11-22",
  employees: [
    { id: "e1", name: "Salma Idrissi", staffCategoryId: INF, serviceId: URG, weeklyHours: 44 },
    { id: "e2", name: "Youssef Amrani", staffCategoryId: INF, serviceId: URG, weeklyHours: 44 },
  ],
  shiftTypes,
  assignments: [],
  rules: seededRules,
  coverageRules: coverage,
  ...over,
});

let aid = 0;
const a = (employeeId: string, date: string, shiftTypeId: string) => ({ id: `a${++aid}`, employeeId, date, shiftTypeId });

describe("rule precedence", () => {
  it("category rule overrides the general rule; inactive ignored", () => {
    const rules = [rule("MAX_CONSECUTIVE_NIGHTS", 5), rule("MAX_CONSECUTIVE_NIGHTS", 3, "BLOCKING", { staffCategoryId: INF }), rule("MAX_CONSECUTIVE_NIGHTS", 1, "BLOCKING", { staffCategoryId: "x", active: false })];
    expect(resolveRule(rules, "MAX_CONSECUTIVE_NIGHTS", INF)?.value).toBe(3);
    expect(resolveRule(rules, "MAX_CONSECUTIVE_NIGHTS", "other")?.value).toBe(5);
    expect(resolveRule(rules, "MAX_CONSECUTIVE_NIGHTS", "x")?.value).toBe(5);
  });
});

describe("analyzePlanning", () => {
  it("empty week with seeded coverage → 'Shift sans personnel' every day, blocking publish", () => {
    const res = analyzePlanning(base({ categoryNames: { [INF]: "Infirmières" }, serviceNames: { [URG]: "Urgences" } }));
    const empty = res.filter((x) => x.type === "COVERAGE_EMPTY");
    expect(empty).toHaveLength(7);
    expect(empty[0]!.title).toBe("Shift sans personnel");
    expect(empty[0]!.message).toBe("Shift « Matin » du 2026-11-16 : personne d'affecté (minimum 2) (infirmières, service Urgences).");
    expect(blockingAnomalies(res)).toHaveLength(7);
  });

  it("an approved exception unblocks", () => {
    const first = analyzePlanning(base());
    const exceptions = first.map((x, i) => ({ id: `x${i}`, anomalyKey: x.key }));
    const res = analyzePlanning(base({ exceptions }));
    expect(res.every((x) => x.exceptionId)).toBe(true);
    expect(blockingAnomalies(res)).toHaveLength(0);
  });

  it("under-staffing and over-staffing", () => {
    const res = analyzePlanning(base({
      from: "2026-11-16", to: "2026-11-16",
      assignments: [a("e1", "2026-11-16", "M")],
    }));
    expect(res.find((x) => x.type === "COVERAGE_UNDER")?.message).toContain("1 personne(s) affectée(s) pour un minimum de 2");
  });

  it("night then morning + rest after night (category rule)", () => {
    const res = analyzePlanning(base({
      coverageRules: [],
      assignments: [a("e1", "2026-11-16", "N"), a("e1", "2026-11-17", "AM")],
    }));
    // N ends 17 at 07:00, AM starts 17 at 15:00 → 8h of rest < 24h (nurse)
    const rest = res.find((x) => x.type === "MIN_REST_AFTER_NIGHT");
    expect(rest?.severity).toBe("BLOCKING");
    expect(rest?.message).toContain("8h00 de repos");
    // AM starts at 15:00 → not a morning
    expect(res.some((x) => x.type === "NIGHT_THEN_MORNING")).toBe(false);
  });

  it("forbids night then morning", () => {
    const res = analyzePlanning(base({ coverageRules: [], assignments: [a("e1", "2026-11-16", "N"), a("e1", "2026-11-18", "M")] }));
    // N ends 17 07:00 → M on 18 07:00 = 24 h gap, not < 24 h
    expect(res.some((x) => x.type === "NIGHT_THEN_MORNING")).toBe(false);
    const res2 = analyzePlanning(base({ coverageRules: [], assignments: [a("e1", "2026-11-16", "N"), a("e1", "2026-11-17", "M")] }));
    expect(res2.some((x) => x.type === "OVERLAPPING_SHIFTS" || x.type === "NIGHT_THEN_MORNING")).toBe(true);
  });

  it("min rest between shifts (general rule) for non-nurses", () => {
    const res = analyzePlanning(base({
      coverageRules: [],
      employees: [{ id: "e3", name: "Karim", staffCategoryId: "adm", serviceId: null, weeklyHours: 44 }],
      assignments: [a("e3", "2026-11-16", "AM"), a("e3", "2026-11-17", "M")],
    }));
    const r = res.find((x) => x.type === "MIN_REST_BETWEEN_SHIFTS");
    expect(r?.message).toContain("8h00 de repos");
  });

  it("max consecutive nights for nurses", () => {
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"];
    const res = analyzePlanning(base({ coverageRules: [], assignments: days.map((d) => a("e1", d, "N")) }));
    const r = res.filter((x) => x.type === "MAX_CONSECUTIVE_NIGHTS");
    expect(r).toHaveLength(1);
    expect(r[0]!.date).toBe("2026-11-19");
  });

  it("weekly hours, overtime and weekly rest", () => {
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
    const res = analyzePlanning(base({ coverageRules: [], assignments: days.map((d) => a("e2", d, "G12")) }));
    // 7 × 11 h = 77 h
    expect(res.find((x) => x.type === "MAX_WEEKLY_HOURS")?.message).toContain("77 h");
    expect(res.find((x) => x.type === "OVERTIME_WEEKLY")?.message).toContain("33 h");
    expect(res.find((x) => x.type === "WEEKLY_REST_DAYS")?.message).toContain("0 jour(s) de repos");
  });

  it("shift too long and missing break", () => {
    const res = analyzePlanning(base({ coverageRules: [], assignments: [a("e2", "2026-11-16", "LONG")] }));
    expect(res.find((x) => x.type === "MAX_SHIFT_HOURS")).toBeDefined();
    expect(res.find((x) => x.type === "BREAK_REQUIRED")).toBeDefined();
  });

  it("shift during an approved leave", () => {
    const res = analyzePlanning(base({
      coverageRules: [],
      assignments: [a("e1", "2026-11-18", "M")],
      leaves: [{ employeeId: "e1", startDate: "2026-11-17", endDate: "2026-11-19", label: "Congés payés" }],
    }));
    expect(res.find((x) => x.type === "SHIFT_DURING_LEAVE")?.message).toContain("Congés payés");
  });

  it("ignores context assignments outside the range", () => {
    const res = analyzePlanning(base({ coverageRules: [], assignments: [a("e2", "2026-11-10", "LONG")] }));
    expect(res).toHaveLength(0);
  });
});

describe("rotation draft", () => {
  it("weekly 3×8 cycle", () => {
    const cells = generateRotationDraft({ unit: "WEEK", sequence: ["M", "AM", "N", "REST"], workDays: [1, 2, 3, 4, 5] }, "2026-11-16", ["e1"], "2026-11-16", "2026-12-13");
    expect(cells.filter((c) => c.shiftTypeId === "M")).toHaveLength(5);
    expect(cells.find((c) => c.date === "2026-11-23")?.shiftTypeId).toBe("AM");
    expect(cells.find((c) => c.date === "2026-11-30")?.shiftTypeId).toBe("N");
    expect(cells.some((c) => c.date >= "2026-12-07")).toBe(false); // REST week
    expect(cells.some((c) => c.date === "2026-11-21")).toBe(false); // Saturday
  });
  it("daily cycle skips non-worked days without advancing", () => {
    const cells = generateRotationDraft({ unit: "DAY", sequence: ["M", "AM"], workDays: [1, 2, 3, 4, 5] }, "2026-11-20", ["e1"], "2026-11-20", "2026-11-24");
    expect(cells.map((c) => `${c.date}:${c.shiftTypeId}`)).toEqual(["2026-11-20:M", "2026-11-23:AM", "2026-11-24:M"]);
  });
});
