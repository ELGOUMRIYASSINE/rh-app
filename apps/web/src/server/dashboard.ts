import "server-only";
import { addDays, eachDay, monthNameFr } from "@yghr/core";
import { dbDate, fromDbDate, liveBoard, prisma, todayIn } from "@yghr/db";

const PERIOD_STATUS: Record<string, string> = { DRAFT: "Brouillon", CALCULATED: "Calculée", VALIDATED: "Validée", LOCKED: "Verrouillée" };

export async function dashboardStats(organizationId: string, opts: { employeeIds?: string[] } = {}) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const tz = org.timezone;
  const today = todayIn(tz);
  const empFilter = opts.employeeIds ? { id: { in: opts.employeeIds } } : {};
  const empRel = opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {};
  const from7 = addDays(today, -6);

  const [board, activeCount, leadsCount, days7, services, punches, devices, period, counts] = await Promise.all([
    liveBoard(prisma, organizationId, today, opts),
    prisma.employee.count({ where: { organizationId, status: "ACTIVE", ...empFilter } }),
    prisma.membership.count({ where: { organizationId, role: "CHEF", active: true } }),
    prisma.attendanceDay.findMany({ where: { organizationId, ...empRel, date: { gte: dbDate(from7), lte: dbDate(today) }, firstIn: { not: null } }, select: { date: true, lateMinutes: true } }),
    prisma.service.findMany({ where: { organizationId, active: true }, select: { name: true, _count: { select: { employees: { where: { status: "ACTIVE", ...empFilter } } } } } }),
    prisma.punch.findMany({ where: { organizationId, deletedAt: null, ...(opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {}) }, orderBy: { timestamp: "desc" }, take: 8, include: { employee: { select: { firstName: true, lastName: true } }, device: { select: { name: true } } } }),
    opts.employeeIds ? Promise.resolve([]) : prisma.device.findMany({ where: { organizationId }, orderBy: { name: "asc" }, take: 5 }),
    opts.employeeIds ? Promise.resolve(null) : prisma.payrollPeriod.findFirst({ where: { organizationId }, orderBy: [{ year: "desc" }, { month: "desc" }], include: { payslips: { select: { gross: true, net: true } } } }),
    Promise.all([prisma.employee.count({ where: { organizationId } }), prisma.shiftType.count({ where: { organizationId } }), prisma.device.count({ where: { organizationId } }), prisma.payrollPeriod.count({ where: { organizationId } })]),
  ]);

  const rows = board.rows;
  const onSite = rows.filter((r) => r.status === "PRESENT" || r.status === "LATE");
  const plannedToday = rows.filter((r) => r.planned.length && r.status !== "LEAVE");
  const arrivals = rows.filter((r) => r.firstIn);
  const late = rows.filter((r) => r.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes);
  const absentNow = plannedToday.filter((r) => r.status !== "PRESENT" && r.status !== "LATE");
  const denominator = plannedToday.length || activeCount;
  const presenceRate = denominator ? Math.round((onSite.length / denominator) * 100) : 0;

  const chart = eachDay(from7, today).map((d) => {
    const list = days7.filter((x) => fromDbDate(x.date) === d);
    return { date: d, onTime: list.filter((x) => x.lateMinutes === 0).length, late: list.filter((x) => x.lateMinutes > 0).length };
  });

  return {
    today,
    timezone: tz,
    activeCount,
    leadsCount,
    onSiteCount: onSite.length,
    arrivalsCount: arrivals.length,
    plannedCount: plannedToday.length,
    lateCount: late.length,
    absentNowCount: absentNow.length,
    presenceRate,
    chart,
    byService: services.map((s) => ({ name: s.name, count: s._count.employees })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count),
    lateList: late.slice(0, 6).map((r) => ({ id: r.employeeId, name: `${r.firstName} ${r.lastName}`, minutes: r.lateMinutes, firstIn: r.firstIn, shift: r.planned[0]?.name ?? null })),
    punches: punches.map((p) => ({
      id: p.id,
      name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : `ID inconnu #${p.deviceUserId ?? "?"}`,
      known: !!p.employee,
      at: p.timestamp.toISOString(),
      device: p.device?.name ?? (p.source === "TABLET" ? "Tablette" : p.source === "CORRECTION" ? "Correction RH" : "Manuel"),
      direction: p.direction,
    })),
    devices: devices.map((d) => ({ id: d.id, name: d.name, status: d.status, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, mode: d.mode })),
    payroll: period
      ? {
          id: period.id,
          label: `${monthNameFr(period.month).replace(/^./, (c) => c.toUpperCase())} ${period.year}`,
          status: period.status,
          statusLabel: PERIOD_STATUS[period.status],
          headcount: period.payslips.length,
          gross: period.payslips.reduce((t, p) => t + p.gross.toNumber(), 0),
          net: period.payslips.reduce((t, p) => t + p.net.toNumber(), 0),
        }
      : null,
    setup: { employees: counts[0] > 0, shifts: counts[1] > 0, devices: counts[2] > 0, payroll: counts[3] > 0 },
  };
}
export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;
