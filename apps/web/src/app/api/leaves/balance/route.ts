import { z } from "zod";
import { LEAVE_TYPES, BALANCE_LEAVE_TYPES, checkLeaveRequest } from "@yghr/core";
import { prisma, dbDate, fromDbDate } from "@yghr/db";
import { fail, route, zDate } from "@/server/api";
import { canDo } from "@/server/context";
import { balancesFor, leaveDays } from "@/server/leave";

/** Live preview for the request form: balance, counted days and warnings. */
export const GET = route(
  { feature: "leaves", allowEmployee: true, query: z.object({ employeeId: z.string().optional(), type: z.enum(LEAVE_TYPES), startDate: zDate.optional(), endDate: zDate.optional(), halfDayStart: z.string().optional(), halfDayEnd: z.string().optional() }) },
  async ({ s, query }) => {
    const employeeId = query.employeeId || s.employeeId;
    if (!employeeId) fail(400, "Bénéficiaire requis.");
    if (employeeId !== s.employeeId && !canDo(s, "leaves.approve", employeeId)) fail(403, "Accès refusé.");
    const balance = BALANCE_LEAVE_TYPES.includes(query.type) ? ((await balancesFor(s.org.id, employeeId!)).find((b) => b.type === query.type) ?? null) : null;
    let days = 0;
    let method = balance?.method ?? "OUVRABLES";
    let warnings: string[] = [];
    if (query.startDate && query.endDate && query.endDate >= query.startDate) {
      const r = await leaveDays(s.org.id, query.type, query.startDate, query.endDate, query.halfDayStart === "true", query.halfDayEnd === "true");
      days = r.days;
      method = r.method;
      const [others, shifts] = await Promise.all([
        prisma.leaveRequest.findMany({ where: { employeeId: employeeId!, status: { in: ["PENDING", "APPROVED"] } } }),
        prisma.shiftAssignment.findMany({ where: { employeeId: employeeId!, leaveRequestId: null, date: { gte: dbDate(query.startDate), lte: dbDate(query.endDate) } }, select: { date: true } }),
      ]);
      warnings = checkLeaveRequest({
        days,
        balance: balance ? { periodStart: balance.periodStart, acquired: balance.acquired, taken: balance.taken, adjusted: balance.adjusted, available: Math.max(0, balance.available - balance.pending) } : null,
        startDate: query.startDate,
        endDate: query.endDate,
        otherRequests: others.map((o) => ({ startDate: fromDbDate(o.startDate), endDate: fromDbDate(o.endDate), status: o.status })),
        plannedShiftDates: shifts.map((x) => fromDbDate(x.date)),
      }).warnings;
    }
    return { balance, days, method, warnings };
  },
);
