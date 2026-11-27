import { describe, expect, it } from "vitest";
import { amountInFrenchWords, annualIncomeTax, computePayslip, DEFAULT_FISCAL_RULES_MA, EMPTY_HOURS, grossHourlyFromNet, numberToFrenchWords } from "../src/payroll";

const monthly = (base: number, familyDependents = 0) =>
  computePayslip({ monthlyBase: base, weeklyHours: 44, familyDependents, hours: EMPTY_HOURS, elements: [] });

/**
 * Hand-computed fixtures (rules seeded from LF 2025):
 *  gross 4 000      → CNSS 179.20 · IPE 7.60 · AMO 90.40 · FP 35 % = 1 400 · NI 2 322.80 → IR 0 · net 3 722.80
 *  gross 9 505.20   → CNSS 268.80 (plafond) · IPE 11.40 · AMO 214.82 · FP 25 % = 2 376.30 · NI 6 633.88
 *                     IR annuel 79 606.56 × 20 % − 10 000 = 5 921.31 → 493.44/mois − 2 pers. (83.33) = 410.11 · net 8 600.07
 *  gross 15 000     → CNSS 268.80 · IPE 11.40 · AMO 339.00 · FP plafonnés 2 916.67 · NI 11 464.13
 *                     IR annuel 137 569.56 × 34 % − 22 000 = 24 773.65 → 2 064.47 · net 12 316.33
 */
describe("Moroccan payroll fixtures", () => {
  it("gross 4 000 DH", () => {
    const r = monthly(4000);
    expect(r.gross).toBe(4000);
    expect(r.cnssEmployee).toBe(179.2);
    expect(r.ipeEmployee).toBe(7.6);
    expect(r.amoEmployee).toBe(90.4);
    expect(r.profExpenses).toBe(1400);
    expect(r.taxableNet).toBe(2322.8);
    expect(r.ir).toBe(0);
    expect(r.net).toBe(3722.8);
  });

  it("gross 9 505.20 DH with 2 dependents (CNSS ceiling)", () => {
    const r = monthly(9505.2, 2);
    expect(r.gross).toBe(9505.2);
    expect(r.cnssBase).toBe(6000);
    expect(r.cnssEmployee).toBe(268.8);
    expect(r.ipeEmployee).toBe(11.4);
    expect(r.amoEmployee).toBe(214.82);
    expect(r.profExpenses).toBe(2376.3);
    expect(r.taxableNet).toBe(6633.88);
    expect(r.irGross).toBe(493.44);
    expect(r.familyDeduction).toBe(83.33);
    expect(r.ir).toBe(410.11);
    expect(r.net).toBe(8600.07);
  });

  it("gross 15 000 DH (professional expenses cap)", () => {
    const r = monthly(15000);
    expect(r.profExpenses).toBe(2916.67);
    expect(r.taxableNet).toBe(11464.13);
    expect(r.ir).toBe(2064.47);
    expect(r.net).toBe(12316.33);
    expect(r.employerCharges).toEqual({
      cnss: 538.8,
      familyAllowance: 960,
      amo: 616.5,
      amoSolidarity: 277.5,
      ipe: 22.8,
      trainingTax: 240,
      total: 2655.6,
    });
  });

  it("IR scale boundaries", () => {
    const b = DEFAULT_FISCAL_RULES_MA.irBrackets;
    expect(annualIncomeTax(40000, b)).toBe(0);
    expect(annualIncomeTax(60000, b)).toBe(2000);
    expect(annualIncomeTax(200000, b)).toBeCloseTo(46600, 6);
  });

  it("family deduction never makes IR negative", () => {
    const r = monthly(5500, 6);
    expect(r.ir).toBeGreaterThanOrEqual(0);
  });

  it("overtime premiums are paid on the hourly rate", () => {
    const r = computePayslip({
      monthlyBase: 3820,
      weeklyHours: 44,
      familyDependents: 0,
      hours: { ...EMPTY_HOURS, overtimeDayMinutes: 600, overtimeNightMinutes: 120 },
      elements: [],
    });
    // hourly = 3820 / 191 = 20 ; 10 h × 25 = 250 ; 2 h × 30 = 60
    expect(r.gross).toBe(3820 + 250 + 60);
  });

  it("advances, deductions and non-taxable transport", () => {
    const r = computePayslip({
      monthlyBase: 4000,
      weeklyHours: 44,
      familyDependents: 0,
      hours: EMPTY_HOURS,
      elements: [
        { kind: "TRANSPORT", label: "Indemnité de transport", amount: 300, taxable: false, cnssSubject: false },
        { kind: "ADVANCE", label: "Acompte", amount: 500, taxable: false, cnssSubject: false },
        { kind: "PRIME", label: "Prime d'assiduité", amount: 200, taxable: true, cnssSubject: true },
      ],
    });
    expect(r.gross).toBe(4200);
    expect(r.nonTaxable).toBe(300);
    expect(r.advances).toBe(500);
    // 4200 − CNSS 188.16 − IPE 7.98 − AMO 94.92 − IR 0 − 500 + 300
    expect(r.net).toBe(3708.94);
  });

  it("warns below the SMIG", () => {
    expect(monthly(2500).warnings.join(" ")).toMatch(/SMIG/);
    expect(monthly(4000).warnings).toHaveLength(0);
  });

  it("grosses up a net hourly rate", () => {
    const gross = grossHourlyFromNet(20, 44);
    const r = computePayslip({ hourlyRate: gross, weeklyHours: 44, familyDependents: 0, hours: { ...EMPTY_HOURS, normalMinutes: 191 * 60 }, elements: [] });
    expect(Math.abs(r.net - 20 * 191)).toBeLessThan(1);
  });
});

describe("amount in words", () => {
  it.each([
    [0, "zéro"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [80, "quatre-vingts"],
    [91, "quatre-vingt-onze"],
    [200, "deux cents"],
    [1000, "mille"],
    [2300, "deux mille trois cents"],
    [200000, "deux cent mille"],
  ])("%i", (n, s) => expect(numberToFrenchWords(n)).toBe(s));
  it("net to pay", () => {
    expect(amountInFrenchWords(8600.07)).toBe("huit mille six cents dirhams et sept centimes");
  });
});
