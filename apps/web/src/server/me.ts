import "server-only";
import { addDays } from "@yghr/core";
import { prisma, dbDate, fromDbDate, liveBoard, todayIn } from "@yghr/db";
import { balancesFor } from "./leave";

export async function myOverview(organizationId: string, employeeId: string, userId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const today = todayIn(org.timezone);
  const [next, board, balances, notifications, payslip, pendingLeaves] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { employeeId, status: "PUBLISHED", leaveRequestId: null, date: { gte: dbDate(today), lte: dbDate(addDays(today, 30)) } }, include: { shiftType: true }, orderBy: { date: "asc" }, take: 6 }),
    liveBoard(prisma, organizationId, today, { employeeIds: [employeeId] }),
    balancesFor(organizationId, employeeId),
    prisma.notification.findMany({ where: { userId, organizationId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.payslip.findFirst({ where: { employeeId, period: { status: "LOCKED" } }, include: { period: true }, orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }] }),
    prisma.leaveRequest.count({ where: { employeeId, status: "PENDING" } }),
  ]);
  const late = await prisma.attendanceDay.findMany({ where: { employeeId, date: { gte: dbDate(addDays(today, -30)), lt: dbDate(today) }, OR: [{ lateMinutes: { gt: 0 } }, { status: "ABSENT" }] }, orderBy: { date: "desc" }, take: 10 });
  return {
    today,
    timezone: org.timezone,
    shifts: next.map((a) => ({ id: a.id, date: fromDbDate(a.date), name: a.shiftType?.name ?? "Horaire personnalisé", code: a.shiftType?.code ?? "PERSO", color: a.shiftType?.color ?? "#66736F", start: a.customStart ?? a.shiftType?.startTime ?? "", end: a.customEnd ?? a.shiftType?.endTime ?? "" })),
    status: board.rows[0] ?? null,
    balances,
    pendingLeaves,
    notifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: !!n.readAt })),
    payslip: payslip ? { id: payslip.id, month: payslip.period.month, year: payslip.period.year, net: payslip.net.toNumber() } : null,
    history: late.map((d) => ({ date: fromDbDate(d.date), status: d.status, late: d.lateMinutes, justified: d.justified })),
  };
}
export type MyOverview = Awaited<ReturnType<typeof myOverview>>;

export async function myShifts(organizationId: string, employeeId: string, from: string, to: string) {
  const rows = await prisma.shiftAssignment.findMany({ where: { organizationId, employeeId, status: "PUBLISHED", date: { gte: dbDate(from), lte: dbDate(to) } }, include: { shiftType: true, leaveRequest: true }, orderBy: { date: "asc" } });
  const leaves = await prisma.leaveRequest.findMany({ where: { organizationId, employeeId, status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(from) } } });
  return {
    shifts: rows.filter((a) => !a.leaveRequestId).map((a) => ({ id: a.id, date: fromDbDate(a.date), name: a.shiftType?.name ?? "Horaire personnalisé", code: a.shiftType?.code ?? "PERSO", color: a.shiftType?.color ?? "#66736F", start: a.customStart ?? a.shiftType?.startTime ?? "", end: a.customEnd ?? a.shiftType?.endTime ?? "", night: a.shiftType?.isNight ?? false })),
    leaves: leaves.map((l) => ({ startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate), type: l.type })),
  };
}
