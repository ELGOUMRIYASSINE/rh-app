import { addDays, dayIndex, type DateStr, eachDay, weekday } from "./time";

export const LEAVE_TYPES = [
  "PAID_LEAVE",
  "RTT",
  "REPOS_COMPENSATEUR",
  "FAMILY_EVENT",
  "UNPAID_LEAVE",
  "SICK_LEAVE",
  "ACCIDENT_TRAVAIL",
  "ACCIDENT_TRAJET",
  "MATERNITY",
  "PATERNITY",
  "PAID_TRAINING",
  "ABSENCE_AUTORISEE",
  "ABSENCE_NON_AUTORISEE",
  "MISE_A_PIED_DISCIPLINAIRE",
  "MISE_A_PIED_CONSERVATOIRE",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  PAID_LEAVE: "Congés payés",
  RTT: "RTT",
  REPOS_COMPENSATEUR: "Repos compensateur",
  FAMILY_EVENT: "Événement familial",
  UNPAID_LEAVE: "Congés sans solde",
  SICK_LEAVE: "Maladie non professionnelle",
  ACCIDENT_TRAVAIL: "Accident du travail",
  ACCIDENT_TRAJET: "Accident de trajet",
  MATERNITY: "Maternité",
  PATERNITY: "Paternité",
  PAID_TRAINING: "Congé formation rémunérée",
  ABSENCE_AUTORISEE: "Absence autorisée rémunérée",
  ABSENCE_NON_AUTORISEE: "Absence non autorisée non rémunérée",
  MISE_A_PIED_DISCIPLINAIRE: "Mise à pied disciplinaire",
  MISE_A_PIED_CONSERVATOIRE: "Mise à pied conservatoire",
};

/** Leave types that are deducted from a balance. */
export const BALANCE_LEAVE_TYPES: LeaveType[] = ["PAID_LEAVE", "RTT", "REPOS_COMPENSATEUR"];
/** Leave types that are not paid by the employer (reduce payroll). */
export const UNPAID_LEAVE_TYPES: LeaveType[] = ["UNPAID_LEAVE", "ABSENCE_NON_AUTORISEE", "MISE_A_PIED_DISCIPLINAIRE", "MISE_A_PIED_CONSERVATOIRE", "SICK_LEAVE", "MATERNITY"];

export type CountingMethod = "OUVRABLES" | "OUVRES";

export interface LeaveDaysInput {
  startDate: DateStr;
  endDate: DateStr;
  method: CountingMethod;
  holidays: DateStr[];
  /** The first day is only an afternoon. */
  halfDayStart?: boolean;
  /** The last day is only a morning. */
  halfDayEnd?: boolean;
}

/** ouvrables = Mon–Sat, ouvrés = Mon–Fri; public holidays always excluded. */
export function isCountedDay(date: DateStr, method: CountingMethod, holidays: Set<DateStr>): boolean {
  const wd = weekday(date);
  if (wd === 0) return false;
  if (method === "OUVRES" && wd === 6) return false;
  return !holidays.has(date);
}

export function countLeaveDays(input: LeaveDaysInput): number {
  if (dayIndex(input.endDate) < dayIndex(input.startDate)) return 0;
  const hol = new Set(input.holidays);
  let days = 0;
  const all = eachDay(input.startDate, input.endDate);
  for (const d of all) if (isCountedDay(d, input.method, hol)) days += 1;
  if (input.halfDayStart && isCountedDay(input.startDate, input.method, hol)) days -= 0.5;
  if (input.halfDayEnd && isCountedDay(input.endDate, input.method, hol) && (input.endDate !== input.startDate || !input.halfDayStart)) days -= 0.5;
  return Math.max(0, days);
}

export interface LeavePolicyDef {
  leaveType: LeaveType;
  enabled: boolean;
  countingMethod: CountingMethod;
  accruedPerMonth: number | null;
  annualAllowance: number | null;
  annualCap: number | null;
  /** "MM-DD" */
  periodStart: string;
  allowAdvanceFirstYear: boolean;
}

/** Start date of the acquisition period that contains `asOf`. */
export function currentPeriodStart(periodStart: string, asOf: DateStr): DateStr {
  const year = Number(asOf.slice(0, 4));
  const candidate = `${year}-${periodStart}`;
  return dayIndex(candidate) <= dayIndex(asOf) ? candidate : `${year - 1}-${periodStart}`;
}

/** Number of full months from `from` up to and including `to` (01-01 → 01-31 = 1). */
export function completedMonthsBetween(from: DateStr, to: DateStr): number {
  if (dayIndex(to) < dayIndex(from)) return 0;
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = addDays(to, 1).split("-").map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

export interface BalanceInput {
  policy: LeavePolicyDef;
  hireDate: DateStr | null;
  asOf: DateStr;
  /** Days already taken (approved) in the current period. */
  taken: number;
  /** Manual adjustments (+/−). */
  adjusted?: number;
  /** Balance carried over from the previous period. */
  carriedOver?: number;
}

export interface Balance {
  periodStart: DateStr;
  acquired: number;
  taken: number;
  adjusted: number;
  available: number;
}

/**
 * Acquired days = accrual per completed month worked in the current period, capped.
 * DECISION: accrual is credited at the end of each completed month. With
 * "congés anticipés la 1ʳᵉ année", the full annual allowance is available from the start.
 */
export function computeBalance(input: BalanceInput): Balance {
  const { policy } = input;
  const ps = currentPeriodStart(policy.periodStart, input.asOf);
  const start = input.hireDate && dayIndex(input.hireDate) > dayIndex(ps) ? input.hireDate : ps;
  const months = completedMonthsBetween(start, input.asOf);
  let acquired = (policy.accruedPerMonth ?? 0) * months;
  if (policy.accruedPerMonth === null && policy.annualAllowance !== null) acquired = policy.annualAllowance;
  const firstYear = input.hireDate !== null && dayIndex(input.hireDate) > dayIndex(ps);
  if (policy.allowAdvanceFirstYear && firstYear && policy.annualAllowance !== null) acquired = Math.max(acquired, policy.annualAllowance);
  if (policy.annualCap !== null) acquired = Math.min(acquired, policy.annualCap);
  acquired += input.carriedOver ?? 0;
  const adjusted = input.adjusted ?? 0;
  const available = Math.round((acquired + adjusted - input.taken) * 100) / 100;
  return { periodStart: ps, acquired: Math.round(acquired * 100) / 100, taken: input.taken, adjusted, available };
}

export interface LeaveCheck {
  days: number;
  exceedsBalance: boolean;
  overlapsRequest: boolean;
  warnings: string[];
}

export function checkLeaveRequest(args: {
  days: number;
  balance?: Balance | null;
  startDate: DateStr;
  endDate: DateStr;
  otherRequests: { startDate: DateStr; endDate: DateStr; status: string }[];
  plannedShiftDates: DateStr[];
}): LeaveCheck {
  const warnings: string[] = [];
  const exceedsBalance = !!args.balance && args.days > args.balance.available;
  if (exceedsBalance) warnings.push(`La demande (${args.days} j) dépasse le solde disponible (${args.balance!.available} j).`);
  const s = dayIndex(args.startDate);
  const e = dayIndex(args.endDate);
  const overlapsRequest = args.otherRequests.some(
    (r) => (r.status === "PENDING" || r.status === "APPROVED") && dayIndex(r.startDate) <= e && dayIndex(r.endDate) >= s,
  );
  if (overlapsRequest) warnings.push("Cette période chevauche une autre demande en attente ou approuvée.");
  const shifts = args.plannedShiftDates.filter((d) => dayIndex(d) >= s && dayIndex(d) <= e);
  if (shifts.length) warnings.push(`${shifts.length} shift(s) planifié(s) sur cette période seront remplacés par le congé.`);
  return { days: args.days, exceedsBalance, overlapsRequest, warnings };
}
