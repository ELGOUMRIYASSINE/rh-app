import "server-only";
import { isoWeeksInRange, shiftDurationMinutes } from "@yghr/core";
import { prisma, dbDate, fromDbDate } from "@yghr/db";

/**
 * Activity report: one row per active employee. Hours come from AttendanceDay (actual worked time),
 * so totals equal the AttendanceDay sums. Pause = unpaid planned breaks of the period.
 */
export async function activityReport(organizationId: string, from: string, to: string, opts: { role?: "all" | "employees" | "leads"; employeeIds?: string[] | null; q?: string } = {}) {
  const leads = new Set((await prisma.membership.findMany({ where: { organizationId, role: "CHEF" }, select: { employeeId: true } })).map((m) => m.employeeId));
  let employees = await prisma.employee.findMany({
    where: { organizationId, status: "ACTIVE", ...(opts.employeeIds ? { id: { in: opts.employeeIds } } : {}), ...(opts.q ? { OR: [{ firstName: { contains: opts.q, mode: "insensitive" } }, { lastName: { contains: opts.q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ lastName: "asc" }],
    include: { service: { select: { name: true } } },
  });
  if (opts.role === "leads") employees = employees.filter((e) => leads.has(e.id));
  if (opts.role === "employees") employees = employees.filter((e) => !leads.has(e.id));
  const ids = employees.map((e) => e.id);
  const weeks = isoWeeksInRange(from, to);
  const [days, assignments, elements] = await Promise.all([
    prisma.attendanceDay.findMany({ where: { organizationId, employeeId: { in: ids }, date: { gte: dbDate(from), lte: dbDate(to) } } }),
    prisma.shiftAssignment.findMany({ where: { organizationId, employeeId: { in: ids }, status: "PUBLISHED", leaveRequestId: null, date: { gte: dbDate(from), lte: dbDate(to) } }, include: { shiftType: true } }),
    prisma.payElement.findMany({ where: { organizationId, employeeId: { in: ids }, OR: [{ period: { year: { gte: Number(from.slice(0, 4)), lte: Number(to.slice(0, 4)) } } }, { periodId: null, createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } }] }, include: { period: true } }),
  ]);
  const inMonths = (y: number, m: number) => {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    return ym >= from.slice(0, 7) && ym <= to.slice(0, 7);
  };
  const rows = employees.map((e) => {
    const d = days.filter((x) => x.employeeId === e.id);
    const a = assignments.filter((x) => x.employeeId === e.id);
    const el = elements.filter((x) => x.employeeId === e.id && (!x.period || inMonths(x.period.year, x.period.month)));
    const breakMin = a.reduce((t, x) => t + (x.shiftType && !x.shiftType.breakPaid ? (x.breakMinutes ?? x.shiftType.breakMinutes) : 0), 0);
    const perWeek = weeks.map((w) => d.filter((x) => { const ds = fromDbDate(x.date); return ds >= w.start && ds <= w.end; }).reduce((t, x) => t + x.workedMinutes, 0));
    const absent = d.filter((x) => x.status === "ABSENT");
    const planned = a.reduce((t, x) => t + (x.shiftType || x.customStart ? shiftDurationMinutes({ startTime: x.customStart ?? x.shiftType!.startTime, endTime: x.customEnd ?? x.shiftType!.endTime, breakMinutes: x.breakMinutes ?? x.shiftType?.breakMinutes ?? 0, breakPaid: x.shiftType?.breakPaid ?? false }) : 0), 0);
    const sum = (k: "workedMinutes" | "normalMinutes" | "nightMinutes" | "overtimeMinutes") => d.reduce((t, x) => t + x[k], 0);
    const amount = (k: string) => el.filter((x) => x.kind === k).reduce((t, x) => t + x.amount.toNumber(), 0);
    return {
      id: e.id, name: `${e.lastName} ${e.firstName}`, matricule: e.matricule, service: e.service?.name ?? null, isLead: leads.has(e.id),
      contractType: e.contractType, weeklyHours: e.weeklyHours?.toNumber() ?? null, hourlyRate: e.hourlyRate?.toNumber() ?? null, monthlyBase: e.monthlyBase?.toNumber() ?? null,
      breakMinutes: breakMin, weeks: perWeek, planned, worked: sum("workedMinutes"), normal: sum("normalMinutes"), night: sum("nightMinutes"), overtime: sum("overtimeMinutes"),
      absentDays: absent.length, absentMinutes: absent.reduce((t, x) => t + x.plannedMinutes, 0),
      primes: amount("PRIME"), advances: amount("ADVANCE"), transport: amount("TRANSPORT"),
    };
  });
  const total = (k: keyof (typeof rows)[number]) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  return {
    from, to,
    weeks: weeks.map((w) => ({ key: w.key, label: `S${String(w.week).padStart(2, "0")}`, start: w.start, end: w.end })),
    rows,
    totals: { breakMinutes: total("breakMinutes"), weeks: weeks.map((_, i) => rows.reduce((t, r) => t + r.weeks[i]!, 0)), worked: total("worked"), normal: total("normal"), night: total("night"), overtime: total("overtime"), absentDays: total("absentDays"), absentMinutes: total("absentMinutes"), primes: total("primes"), advances: total("advances"), transport: total("transport") },
  };
}
export type ActivityReport = Awaited<ReturnType<typeof activityReport>>;
