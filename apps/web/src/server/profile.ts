import "server-only";
import { addDays } from "@yghr/core";
import { prisma, dbDate, fromDbDate, todayIn } from "@yghr/db";
import { balancesFor } from "./leave";

export async function loadProfile(orgId: string, id: string, tz: string) {
  const e = await prisma.employee.findFirst({
    where: { id, organizationId: orgId },
    include: { service: true, staffCategory: true, teamLead: { select: { id: true, firstName: true, lastName: true } }, membership: { include: { user: { select: { passwordHash: true, lastLoginAt: true } } } } },
  });
  if (!e) return null;
  const today = todayIn(tz);
  const [assignments, attendance, leaves, documents, payslips, history, services, categories, leads, balances] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { employeeId: id, date: { gte: dbDate(addDays(today, -7)), lte: dbDate(addDays(today, 21)) } }, include: { shiftType: true }, orderBy: { date: "asc" } }),
    prisma.attendanceDay.findMany({ where: { employeeId: id, date: { gte: dbDate(addDays(today, -31)), lte: dbDate(today) } }, orderBy: { date: "desc" } }),
    prisma.leaveRequest.findMany({ where: { employeeId: id }, orderBy: { startDate: "desc" }, take: 20 }),
    prisma.document.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.payslip.findMany({ where: { employeeId: id }, include: { period: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.auditLog.findMany({ where: { organizationId: orgId, entityId: id }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.service.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.staffCategory.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { organizationId: orgId, status: "ACTIVE", membership: { role: "CHEF" } }, select: { id: true, firstName: true, lastName: true } }),
    balancesFor(orgId, id),
  ]);
  const d = (x: Date | null) => (x ? fromDbDate(x) : null);
  return {
    today,
    employee: {
      id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, phone: e.phone, matricule: e.matricule, position: e.position,
      serviceId: e.serviceId, staffCategoryId: e.staffCategoryId, teamLeadId: e.teamLeadId, service: e.service?.name ?? null, category: e.staffCategory?.name ?? null,
      teamLead: e.teamLead ? `${e.teamLead.firstName} ${e.teamLead.lastName}` : null, contractType: e.contractType, contractReason: e.contractReason,
      weeklyHours: e.weeklyHours?.toNumber() ?? null, hourlyRate: e.hourlyRate?.toNumber() ?? null, netHourlyRate: e.netHourlyRate?.toNumber() ?? null, monthlyBase: e.monthlyBase?.toNumber() ?? null,
      birthDate: d(e.birthDate), hireDate: d(e.hireDate), cnssNumber: e.cnssNumber, cin: e.cin, familyDependents: e.familyDependents, status: e.status,
      access: !e.membership ? "none" : e.membership.user.passwordHash ? "active" : "invited", lastLoginAt: e.membership?.user.lastLoginAt?.toISOString() ?? null, role: e.membership?.role ?? null,
    },
    assignments: assignments.map((a) => ({ id: a.id, date: fromDbDate(a.date), status: a.status, name: a.shiftType?.name ?? "Horaire personnalisé", code: a.shiftType?.code ?? "PERSO", color: a.shiftType?.color ?? "#66736F", start: a.customStart ?? a.shiftType?.startTime ?? "", end: a.customEnd ?? a.shiftType?.endTime ?? "", leave: !!a.leaveRequestId })),
    attendance: attendance.map((a) => ({ date: fromDbDate(a.date), status: a.status, firstIn: a.firstIn?.toISOString() ?? null, lastOut: a.lastOut?.toISOString() ?? null, worked: a.workedMinutes, night: a.nightMinutes, overtime: a.overtimeMinutes, late: a.lateMinutes, validated: !!a.validatedAt, issues: a.issues })),
    leaves: leaves.map((l) => ({ id: l.id, type: l.type, startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate), days: l.days.toNumber(), status: l.status })),
    documents: documents.map((x) => ({ id: x.id, title: x.title, category: x.category, createdAt: x.createdAt.toISOString(), fileUrl: x.fileUrl })),
    payslips: payslips.map((p) => ({ id: p.id, month: p.period.month, year: p.period.year, net: p.net.toNumber(), gross: p.gross.toNumber(), status: p.period.status })),
    history: history.map((h) => ({ id: h.id, action: h.action, entity: h.entity, details: h.details as Record<string, unknown> | null, createdAt: h.createdAt.toISOString(), user: h.user ? `${h.user.firstName} ${h.user.lastName}` : "Système" })),
    services, categories, leads: leads.filter((l) => l.id !== id).map((l) => ({ id: l.id, name: `${l.firstName} ${l.lastName}` })),
    balances,
  };
}
export type ProfileData = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

