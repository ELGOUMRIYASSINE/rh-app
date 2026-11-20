import { z } from "zod";
import { autoLinkDeviceUsers, mapDeviceUser, prisma, suggestEmployee } from "@yghr/db";
import { fail, route } from "@/server/api";
import { emit } from "@/server/realtime";

/**
 * Everyone known to the clocks, one row per fingerprint ID (PIN): name stored in the clock, rights,
 * enrolled credentials, clock-in counts, linked employee (or a suggestion).
 */
export const GET = route({ feature: "devices", rhOnly: true }, async ({ s }) => {
  const O = s.org.id;
  const [users, maps, stats, employees, devices] = await Promise.all([
    prisma.deviceUser.findMany({ where: { organizationId: O } }),
    prisma.deviceUserMap.findMany({ where: { organizationId: O }, include: { employee: { select: { id: true, firstName: true, lastName: true, matricule: true } } } }),
    prisma.punch.groupBy({ by: ["deviceUserId"], where: { organizationId: O, deviceUserId: { not: null }, deletedAt: null }, _count: true, _max: { timestamp: true } }),
    prisma.employee.findMany({ where: { organizationId: O, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, matricule: true } }),
    prisma.device.findMany({ where: { organizationId: O }, select: { id: true, name: true } }),
  ]);
  const devName = new Map(devices.map((d) => [d.id, d.name]));
  const mapBy = new Map(maps.map((m) => [m.deviceUserId, m]));
  const statBy = new Map(stats.map((x) => [x.deviceUserId!, x]));
  const pins = new Set([...users.map((u) => u.deviceUserId), ...stats.map((x) => x.deviceUserId!), ...maps.map((m) => m.deviceUserId)]);
  const linkedEmp = new Set(maps.map((m) => m.employeeId));
  const freeEmployees = employees.filter((e) => !linkedEmp.has(e.id));
  const rows = [...pins].map((pin) => {
    const recs = users.filter((u) => u.deviceUserId === pin);
    const name = recs.find((r) => r.name)?.name ?? null;
    const m = mapBy.get(pin);
    const st = statBy.get(pin);
    return {
      pin, name,
      admin: recs.some((r) => r.role >= 14 || r.role === 6),
      fingerprints: Math.max(0, ...recs.map((r) => r.fingerprints)),
      face: recs.some((r) => r.hasFace),
      card: recs.find((r) => r.cardNumber)?.cardNumber ?? null,
      password: recs.some((r) => r.hasPassword),
      devices: recs.map((r) => devName.get(r.deviceId) ?? "Pointeuse supprimée"),
      inDevice: recs.length > 0,
      punches: st?._count ?? 0,
      lastPunch: st?._max.timestamp?.toISOString() ?? null,
      employee: m ? { id: m.employee.id, mapId: m.id, name: `${m.employee.firstName} ${m.employee.lastName}`, matricule: m.employee.matricule } : null,
      suggestion: m ? null : suggestEmployee(name, pin, freeEmployees),
    };
  });
  rows.sort((a, b) => Number(!!a.employee) - Number(!!b.employee) || (Number(a.pin) || 0) - (Number(b.pin) || 0) || a.pin.localeCompare(b.pin));
  return { rows, employees: employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}`, linked: linkedEmp.has(e.id) })) };
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("autolink") }),
  z.object({ action: z.literal("accept"), pins: z.array(z.string()).min(1).max(1000) }),
  z.object({ action: z.literal("create"), pins: z.array(z.string()).min(1).max(1000) }),
]);

/** autolink: match by name / matricule · accept: apply suggestions · create: create the missing employees from clock names. */
export const POST = route({ feature: "devices", rhOnly: true, body: Action }, async ({ s, body, log }) => {
  const O = s.org.id;
  if (body.action === "autolink") {
    const linked = await autoLinkDeviceUsers(prisma, O);
    await log("UPDATE", "DEVICE_USER_MAP", null, { autolink: linked });
    if (linked) await emit(O, "attendance:update", {});
    return { linked };
  }
  const employees = await prisma.employee.findMany({ where: { organizationId: O, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, matricule: true } });
  const mapped = await prisma.deviceUserMap.findMany({ where: { organizationId: O }, select: { deviceUserId: true, employeeId: true } });
  const mappedPins = new Set(mapped.map((m) => m.deviceUserId));
  const users = await prisma.deviceUser.findMany({ where: { organizationId: O, deviceUserId: { in: body.pins } } });
  const nameOf = (pin: string) => users.find((u) => u.deviceUserId === pin && u.name)?.name ?? null;

  if (body.action === "accept") {
    const used = new Set(mapped.map((m) => m.employeeId));
    let linked = 0;
    for (const pin of body.pins) {
      if (mappedPins.has(pin)) continue;
      const id = suggestEmployee(nameOf(pin), pin, employees.filter((e) => !used.has(e.id)));
      if (!id) continue;
      await mapDeviceUser(prisma, O, pin, id);
      used.add(id);
      linked++;
    }
    await log("UPDATE", "DEVICE_USER_MAP", null, { accepted: linked });
    if (linked) await emit(O, "attendance:update", {});
    return { linked };
  }

  // create: one employee per unlinked PIN, named after the clock (no e-mail yet → no invitation).
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: O }, select: { slug: true } });
  const centres = await prisma.centre.findMany({ where: { organizationId: O, active: true }, select: { id: true } });
  const usedMatricules = new Set(employees.map((e) => e.matricule).filter(Boolean));
  let created = 0;
  const skipped: string[] = [];
  for (const pin of body.pins) {
    if (mappedPins.has(pin)) continue;
    const name = nameOf(pin);
    if (!name) { skipped.push(pin); continue; }
    const parts = name.trim().split(/\s+/);
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    const firstName = cap(parts[0]!);
    const lastName = parts.length > 1 ? parts.slice(1).map(cap).join(" ") : `(ID ${pin})`;
    const emp = await prisma.employee.create({
      data: {
        organizationId: O, firstName, lastName, email: `pointeuse-${pin}@${org.slug}.a-completer.invalid`,
        matricule: usedMatricules.has(pin) ? null : pin, centreId: centres.length === 1 ? centres[0]!.id : null,
      },
    });
    await mapDeviceUser(prisma, O, pin, emp.id);
    created++;
  }
  await log("CREATE", "EMPLOYEE", null, { fromDevice: created });
  if (created) await emit(O, "attendance:update", {});
  if (!created && skipped.length) fail(400, "Ces IDs n'ont pas de nom enregistré dans la pointeuse : récupérez d'abord les utilisateurs, ou créez les salariés à la main.");
  return { created, skipped: skipped.length };
});
