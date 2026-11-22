import { z } from "zod";
import { prisma, todayIn } from "@yghr/db";
import { route } from "@/server/api";

const dayStart = (d: string, tz: string) => {
  // UTC instant of local midnight for `d` in `tz`
  const guess = new Date(`${d}T00:00:00Z`);
  const off = new Date(guess.toLocaleString("en-US", { timeZone: tz })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - off);
};

/**
 * Clock-ins of one day (default: today), newest first, each labelled Entrée / Sortie:
 * the clock's own key when it sent one, otherwise alternating per person in time order.
 */
export const GET = route({ feature: "devices", rhOnly: true, query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dir: z.enum(["all", "in", "out"]).optional() }) }, async ({ s, query }) => {
  const tz = s.org.timezone;
  const date = query.date ?? todayIn(tz);
  const from = dayStart(date, tz);
  const to = new Date(from.getTime() + 86400_000);
  const [rows, names] = await Promise.all([
    prisma.punch.findMany({ where: { organizationId: s.org.id, deletedAt: null, timestamp: { gte: from, lt: to } }, orderBy: { timestamp: "asc" }, take: 5000, include: { employee: { select: { id: true, firstName: true, lastName: true } }, device: { select: { name: true } } } }),
    prisma.deviceUser.findMany({ where: { organizationId: s.org.id, name: { not: null } }, select: { deviceUserId: true, name: true } }),
  ]);
  const nameBy = new Map(names.map((u) => [u.deviceUserId, u.name!]));
  const count = new Map<string, number>();
  const items = rows.map((p) => {
    const who = p.employeeId ?? `pin:${p.deviceUserId}`;
    const n = count.get(who) ?? 0;
    count.set(who, n + 1);
    const dir = (p.direction as "IN" | "OUT" | null) ?? (n % 2 === 0 ? "IN" : "OUT");
    return {
      id: p.id, at: p.timestamp.toISOString(), receivedAt: p.receivedAt.toISOString(), deviceTime: p.deviceTime?.toISOString() ?? null,
      employee: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : null, employeeId: p.employeeId, deviceUserId: p.deviceUserId,
      deviceName: p.deviceUserId ? (nameBy.get(p.deviceUserId) ?? null) : null, state: p.state, device: p.device?.name ?? null,
      source: p.source, verifyMode: p.verifyMode, direction: dir, explicit: !!p.direction,
    };
  });
  const ins = items.filter((i) => i.direction === "IN").length;
  const filtered = query.dir === "in" ? items.filter((i) => i.direction === "IN") : query.dir === "out" ? items.filter((i) => i.direction === "OUT") : items;
  return { date, items: filtered.reverse(), counts: { all: items.length, in: ins, out: items.length - ins, people: count.size } };
});
