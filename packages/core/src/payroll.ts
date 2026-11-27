import { round2 } from "./time";

/** FiscalRuleVersion.data — versioned, admin-editable. Values are data, not code. */
export interface FiscalRules {
  currency: string;
  cnss: { employeeRate: number; employerRate: number; ceiling: number };
  ipe: { employeeRate: number; employerRate: number; ceiling: number };
  amo: { employeeRate: number; employerRate: number; solidarityEmployerRate: number };
  familyAllowanceEmployerRate: number;
  trainingTaxEmployerRate: number;
  profExpenses: { upToAnnualGross?: number; rate: number }[];
  profExpensesAnnualCap: number;
  /** [upperBound | null, rate, deduction] — annual */
  irBrackets: [number | null, number, number][];
  familyDeductionPerDependentAnnual: number;
  familyDependentsMax: number;
  overtime: { day: number; night: number; restDayDay: number; restDayNight: number };
  smig: { hourly: number | null; monthly: number | null };
  /** Monthly hours equivalent to a 44 h week (Morocco: 191 h). */
  monthlyHoursFor44h?: number;
  /** Optional premium on normal (non-overtime) night hours. 0 = none. */
  nightPremiumRate?: number;
}

/**
 * Seed values (MA). DECISION / À VÉRIFIER : à confirmer avec votre expert-comptable —
 * notamment les frais professionnels, qui diffèrent selon les versions de la loi de finances.
 */
export const DEFAULT_FISCAL_RULES_MA: FiscalRules = {
  currency: "MAD",
  cnss: { employeeRate: 0.0448, employerRate: 0.0898, ceiling: 6000 },
  ipe: { employeeRate: 0.0019, employerRate: 0.0038, ceiling: 6000 },
  amo: { employeeRate: 0.0226, employerRate: 0.0411, solidarityEmployerRate: 0.0185 },
  familyAllowanceEmployerRate: 0.064,
  trainingTaxEmployerRate: 0.016,
  profExpenses: [{ upToAnnualGross: 78000, rate: 0.35 }, { rate: 0.25 }],
  profExpensesAnnualCap: 35000,
  irBrackets: [
    [40000, 0, 0],
    [60000, 0.1, 4000],
    [80000, 0.2, 10000],
    [100000, 0.3, 18000],
    [180000, 0.34, 22000],
    [null, 0.37, 27400],
  ],
  familyDeductionPerDependentAnnual: 500,
  familyDependentsMax: 6,
  overtime: { day: 0.25, night: 0.5, restDayDay: 0.5, restDayNight: 1.0 },
  smig: { hourly: null, monthly: 3111.39 },
  monthlyHoursFor44h: 191,
  nightPremiumRate: 0,
};

export type PayElementKind = "PRIME" | "TRANSPORT" | "ADVANCE" | "EXPENSE" | "DEDUCTION";

export interface PayElementInput {
  kind: PayElementKind;
  label: string;
  amount: number;
  taxable: boolean;
  cnssSubject: boolean;
}

export interface PayrollHours {
  /** Paid non-overtime minutes worked on regular days (night included). */
  normalMinutes: number;
  /** Subset of normalMinutes that fell in the night window (informative / optional premium). */
  nightMinutes: number;
  overtimeDayMinutes: number;
  overtimeNightMinutes: number;
  restDayDayMinutes: number;
  restDayNightMinutes: number;
  /** Unpaid absences to deduct from a monthly base. */
  unpaidAbsenceMinutes: number;
}

export const EMPTY_HOURS: PayrollHours = {
  normalMinutes: 0,
  nightMinutes: 0,
  overtimeDayMinutes: 0,
  overtimeNightMinutes: 0,
  restDayDayMinutes: 0,
  restDayNightMinutes: 0,
  unpaidAbsenceMinutes: 0,
};

export interface PayrollInput {
  monthlyBase?: number | null;
  hourlyRate?: number | null;
  weeklyHours?: number | null;
  familyDependents: number;
  hours: PayrollHours;
  elements: PayElementInput[];
  /** Extra employee deduction such as CIMR (monthly amount). */
  cimrEmployee?: number;
}

export interface PayslipLine {
  code: string;
  label: string;
  base?: number;
  rate?: number;
  gain?: number;
  deduction?: number;
  employer?: number;
}

export interface PayslipResult {
  lines: PayslipLine[];
  gross: number;
  cnssBase: number;
  cnssEmployee: number;
  ipeEmployee: number;
  amoEmployee: number;
  cimrEmployee: number;
  profExpenses: number;
  taxableNet: number;
  irGross: number;
  familyDeduction: number;
  ir: number;
  nonTaxable: number;
  otherDeductions: number;
  advances: number;
  net: number;
  employerCharges: {
    cnss: number;
    familyAllowance: number;
    amo: number;
    amoSolidarity: number;
    ipe: number;
    trainingTax: number;
    total: number;
  };
  effectiveHourlyRate: number;
  warnings: string[];
}

function monthlyHours(weeklyHours: number | null | undefined, rules: FiscalRules): number {
  const wh = weeklyHours && weeklyHours > 0 ? weeklyHours : 44;
  return round2(((rules.monthlyHoursFor44h ?? 191) * wh) / 44);
}

/** Annual IR from the annualised scale. */
export function annualIncomeTax(annualTaxable: number, brackets: FiscalRules["irBrackets"]): number {
  for (const [upper, rate, deduction] of brackets) {
    if (upper === null || annualTaxable <= upper) return Math.max(0, annualTaxable * rate - deduction);
  }
  return 0;
}

export function computePayslip(input: PayrollInput, rules: FiscalRules = DEFAULT_FISCAL_RULES_MA): PayslipResult {
  const warnings: string[] = [];
  const lines: PayslipLine[] = [];
  const mh = monthlyHours(input.weeklyHours, rules);
  const hourly = input.hourlyRate && input.hourlyRate > 0 ? input.hourlyRate : input.monthlyBase ? input.monthlyBase / mh : 0;
  if (!hourly && !input.monthlyBase) warnings.push("Taux horaire et base mensuelle manquants : salaire de base nul.");
  const H = input.hours;
  const toH = (m: number) => round2(m / 60);

  // 1. Gross
  let gross = 0;
  let cnssSubject = 0;
  const earn = (line: PayslipLine, subjectToCnss = true) => {
    const g = round2(line.gain ?? 0);
    if (!g) return;
    lines.push({ ...line, gain: g });
    gross += g;
    if (subjectToCnss) cnssSubject += g;
  };

  if (input.monthlyBase) {
    earn({ code: "100", label: "Salaire de base", base: mh, rate: round2(hourly), gain: input.monthlyBase });
    if (H.unpaidAbsenceMinutes > 0) {
      const ded = round2(hourly * toH(H.unpaidAbsenceMinutes));
      lines.push({ code: "110", label: "Absences non rémunérées", base: toH(H.unpaidAbsenceMinutes), rate: round2(hourly), deduction: ded });
      gross -= ded;
      cnssSubject -= ded;
    }
  } else {
    earn({ code: "100", label: "Salaire de base (heures normales)", base: toH(H.normalMinutes), rate: round2(hourly), gain: hourly * toH(H.normalMinutes) });
  }
  const ot = rules.overtime;
  const otLine = (code: string, label: string, minutes: number, premium: number) => {
    if (minutes <= 0) return;
    earn({ code, label: `${label} (+${Math.round(premium * 100)} %)`, base: toH(minutes), rate: round2(hourly * (1 + premium)), gain: hourly * toH(minutes) * (1 + premium) });
  };
  otLine("200", "Heures sup. de jour", H.overtimeDayMinutes, ot.day);
  otLine("210", "Heures sup. de nuit", H.overtimeNightMinutes, ot.night);
  otLine("220", "Heures jour de repos (jour)", H.restDayDayMinutes, ot.restDayDay);
  otLine("230", "Heures jour de repos (nuit)", H.restDayNightMinutes, ot.restDayNight);
  if ((rules.nightPremiumRate ?? 0) > 0 && H.nightMinutes > 0) {
    earn({ code: "240", label: "Prime de nuit", base: toH(H.nightMinutes), rate: round2(hourly * rules.nightPremiumRate!), gain: hourly * toH(H.nightMinutes) * rules.nightPremiumRate! });
  }

  let nonTaxable = 0;
  let advances = 0;
  let otherDeductions = 0;
  for (const el of input.elements) {
    const amount = round2(el.amount);
    if (!amount) continue;
    if (el.kind === "ADVANCE") {
      advances += amount;
    } else if (el.kind === "DEDUCTION") {
      otherDeductions += amount;
    } else if (el.taxable) {
      earn({ code: el.kind === "PRIME" ? "300" : "310", label: el.label, gain: amount }, el.cnssSubject);
    } else {
      nonTaxable += amount;
    }
  }
  gross = round2(gross);
  cnssSubject = round2(Math.max(0, cnssSubject));

  // 2–3. Social contributions
  const cnssBase = Math.min(cnssSubject, rules.cnss.ceiling);
  const cnssEmployee = round2(cnssBase * rules.cnss.employeeRate);
  const ipeBase = Math.min(cnssSubject, rules.ipe.ceiling);
  const ipeEmployee = round2(ipeBase * rules.ipe.employeeRate);
  const amoEmployee = round2(cnssSubject * rules.amo.employeeRate);
  const cimrEmployee = round2(input.cimrEmployee ?? 0);
  lines.push({ code: "500", label: "CNSS (prestations sociales)", base: round2(cnssBase), rate: rules.cnss.employeeRate, deduction: cnssEmployee, employer: round2(cnssBase * rules.cnss.employerRate) });
  lines.push({ code: "510", label: "Indemnité perte d'emploi (IPE)", base: round2(ipeBase), rate: rules.ipe.employeeRate, deduction: ipeEmployee, employer: round2(ipeBase * rules.ipe.employerRate) });
  lines.push({ code: "520", label: "AMO", base: cnssSubject, rate: rules.amo.employeeRate, deduction: amoEmployee, employer: round2(cnssSubject * rules.amo.employerRate) });
  if (cimrEmployee) lines.push({ code: "530", label: "CIMR", deduction: cimrEmployee });

  // 4. Professional expenses
  const annualGross = gross * 12;
  const tier = rules.profExpenses.find((t) => t.upToAnnualGross === undefined || annualGross <= t.upToAnnualGross) ?? rules.profExpenses[rules.profExpenses.length - 1]!;
  const profExpenses = round2(Math.min(gross * tier.rate, rules.profExpensesAnnualCap / 12));

  // 5. Net taxable
  const taxableNet = round2(Math.max(0, gross - cnssEmployee - amoEmployee - ipeEmployee - cimrEmployee - profExpenses));

  // 6. IR
  const irGrossRaw = annualIncomeTax(taxableNet * 12, rules.irBrackets) / 12;
  const deps = Math.min(Math.max(0, input.familyDependents), rules.familyDependentsMax);
  const familyRaw = (deps * rules.familyDeductionPerDependentAnnual) / 12;
  const ir = round2(Math.max(0, irGrossRaw - familyRaw));
  const irGross = round2(irGrossRaw);
  const familyDeduction = round2(Math.min(familyRaw, irGrossRaw));
  lines.push({ code: "600", label: "Impôt sur le revenu (IR)", base: taxableNet, deduction: ir });

  // 7. Net
  for (const el of input.elements) {
    if (el.kind === "ADVANCE" && el.amount) lines.push({ code: "700", label: el.label || "Acompte", deduction: round2(el.amount) });
    if (el.kind === "DEDUCTION" && el.amount) lines.push({ code: "710", label: el.label || "Retenue", deduction: round2(el.amount) });
    if (!el.taxable && (el.kind === "TRANSPORT" || el.kind === "EXPENSE" || el.kind === "PRIME") && el.amount)
      lines.push({ code: "800", label: `${el.label} (non imposable)`, gain: round2(el.amount) });
  }
  const net = round2(gross - cnssEmployee - ipeEmployee - amoEmployee - cimrEmployee - ir - advances - otherDeductions + nonTaxable);

  // 8. Employer charges
  const ec = {
    cnss: round2(cnssBase * rules.cnss.employerRate),
    familyAllowance: round2(cnssSubject * rules.familyAllowanceEmployerRate),
    amo: round2(cnssSubject * rules.amo.employerRate),
    amoSolidarity: round2(cnssSubject * rules.amo.solidarityEmployerRate),
    ipe: round2(ipeBase * rules.ipe.employerRate),
    trainingTax: round2(gross * rules.trainingTaxEmployerRate),
    total: 0,
  };
  ec.total = round2(ec.cnss + ec.familyAllowance + ec.amo + ec.amoSolidarity + ec.ipe + ec.trainingTax);

  // 9. SMIG check
  const smigMonthly = rules.smig.monthly ? (rules.smig.monthly * (input.weeklyHours ?? 44)) / 44 : null;
  const smigHourly = rules.smig.hourly ?? (rules.smig.monthly ? rules.smig.monthly / (rules.monthlyHoursFor44h ?? 191) : null);
  if (input.monthlyBase && smigMonthly && input.monthlyBase < smigMonthly - 0.005)
    warnings.push(`Base mensuelle (${input.monthlyBase} DH) inférieure au SMIG (${round2(smigMonthly)} DH).`);
  if (!input.monthlyBase && smigHourly && hourly > 0 && hourly < smigHourly - 0.005)
    warnings.push(`Taux horaire (${round2(hourly)} DH) inférieur au SMIG horaire (${round2(smigHourly)} DH).`);
  if (net < 0) warnings.push("Le net à payer est négatif : vérifiez les acomptes et retenues.");

  return {
    lines,
    gross,
    cnssBase: round2(cnssBase),
    cnssEmployee,
    ipeEmployee,
    amoEmployee,
    cimrEmployee,
    profExpenses,
    taxableNet,
    irGross,
    familyDeduction,
    ir,
    nonTaxable: round2(nonTaxable),
    otherDeductions: round2(otherDeductions),
    advances: round2(advances),
    net,
    employerCharges: ec,
    effectiveHourlyRate: round2(hourly),
    warnings,
  };
}

/**
 * The employee form only asks for "Salaire net / heure (DH)". Find the gross hourly rate that yields
 * that net for a standard month (contract hours, no extras). Binary search on computePayslip.
 */
export function grossHourlyFromNet(netHourly: number, weeklyHours: number | null | undefined, familyDependents = 0, rules: FiscalRules = DEFAULT_FISCAL_RULES_MA): number {
  if (netHourly <= 0) return 0;
  const mh = monthlyHours(weeklyHours, rules);
  const targetNet = netHourly * mh;
  let lo = netHourly;
  let hi = netHourly * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = computePayslip({ hourlyRate: mid, weeklyHours, familyDependents, hours: { ...EMPTY_HOURS, normalMinutes: mh * 60 }, elements: [] }, rules);
    if (r.net < targetNet) lo = mid;
    else hi = mid;
  }
  return round2(hi);
}

// ---------- Amount in French words ----------
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n <= 16) return UNITS[n]!;
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t]!;
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${below100(n - 60)}`;
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${below100(n - 80)}`;
}

function below1000(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (c === 1) s = "cent";
  else if (c > 1) s = `${UNITS[c]} cent${r === 0 ? "s" : ""}`;
  if (r) s = s ? `${s} ${below100(r)}` : below100(r);
  return s || "zéro";
}

export function numberToFrenchWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(millions === 1 ? "un million" : `${below1000(millions)} millions`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands).replace(/cents$/, "cent")} mille`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 8600.07 → "huit mille six cents dirhams et sept centimes" */
export function amountInFrenchWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const dh = Math.floor(cents / 100);
  const c = cents % 100;
  let s = `${numberToFrenchWords(dh)} dirham${dh > 1 ? "s" : ""}`;
  if (c) s += ` et ${numberToFrenchWords(c)} centime${c > 1 ? "s" : ""}`;
  return s;
}
