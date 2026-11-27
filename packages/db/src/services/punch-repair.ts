import type { PrismaClient } from "../generated/prisma/client";
import { localDateTimeToUtc, todayIn } from "../tz";
import { recomputeAttendance } from "./attendance";
import { syncLanDevice } from "./devices";
import { addDays } from "@yghr/core";

/**
 * Repair the clock-ins of an organisation damaged by the old "server time" behaviour
 * (every imported clock-in stamped with the import time, then imported again on each sync).
 * Nothing is hard-deleted: removed clock-ins are soft-deleted with a reason and stay visible.
 *
 * 1. ADMS clock-ins: restore the real time from the line the clock sent.
 * 2. LAN clock-ins stamped in batch (same exact time for 3+ people on one device): re-read the real
 *    ones from the clock, then set the batch-stamped ones aside. Skipped if the clock is unreachable.
 * 3. Repeats of the same person within the anti-repeat window: keep the first, set the others aside.
 * 4. Recompute the attendance of every affected employee and day.
 */
export async function repairPunches(db: PrismaClient, organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, punchDedupMinutes: true } });
  const touched = new Map<string, Set<string>>(); // employeeId → days
  const touch = (employeeId: string | null, at: Date) => {
    if (!employeeId) return;
    const d = todayIn(org.timezone, at);
    (touched.get(employeeId) ?? touched.set(employeeId, new Set()).get(employeeId)!).add(d);
  };
  const report = { restored: 0, batchRemoved: 0, repeatsRemoved: 0, devicesResynced: 0, devicesUnreachable: [] as string[] };

  // 1. ADMS: real time is in the raw line "PIN\tYYYY-MM-DD HH:MM:SS\t…"
  const adms = await db.punch.findMany({ where: { organizationId, source: "DEVICE", deletedAt: null, device: { mode: "ADMS" } }, select: { id: true, timestamp: true, deviceId: true, deviceUserId: true, employeeId: true, rawPayload: true } });
  const seen = new Set<string>();
  for (const p of adms.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    const line = (p.rawPayload as { line?: string } | null)?.line;
    const m = line ? /\t(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(line) : null;
    if (!m) continue;
    const real = new Date(localDateTimeToUtc(m[1]!, `${m[2]}:${m[3]}`, org.timezone).getTime() + Number(m[4]) * 1000);
    const key = `${p.deviceId}|${p.deviceUserId}|${real.getTime()}`;
    if (seen.has(key)) {
      await db.punch.update({ where: { id: p.id }, data: { deletedAt: new Date(), reason: "Doublon (même pointage reçu plusieurs fois)", deviceTime: null } });
      report.batchRemoved++;
      touch(p.employeeId, p.timestamp);
      continue;
    }
    seen.add(key);
    if (Math.abs(real.getTime() - p.timestamp.getTime()) >= 1000) {
      touch(p.employeeId, p.timestamp);
      await db.punch.update({ where: { id: p.id }, data: { timestamp: real, deviceTime: real } }).catch(async () => {
        // another row already holds this clock time: this one is a copy
        await db.punch.update({ where: { id: p.id }, data: { deletedAt: new Date(), reason: "Doublon (même pointage reçu plusieurs fois)", deviceTime: null } });
        report.batchRemoved++;
      });
      touch(p.employeeId, real);
      report.restored++;
    }
  }

  // 2. LAN: batch-stamped rows share the exact same millisecond for several people on one device.
  const lanDevices = await db.device.findMany({ where: { organizationId, mode: "LAN" }, select: { id: true, name: true } });
  for (const d of lanDevices) {
    const groups = await db.punch.groupBy({ by: ["timestamp"], where: { deviceId: d.id, deletedAt: null, source: "DEVICE" }, _count: true, having: { timestamp: { _count: { gte: 3 } } } });
    if (!groups.length) continue;
    try {
      // Move the suspect rows out of the way first (their deviceTime was the import time), then re-read the clock.
      const suspects = await db.punch.findMany({ where: { deviceId: d.id, deletedAt: null, source: "DEVICE", timestamp: { in: groups.map((g) => g.timestamp) } }, select: { id: true, employeeId: true, timestamp: true } });
      await db.punch.updateMany({ where: { id: { in: suspects.map((s) => s.id) } }, data: { deletedAt: new Date(), reason: "Horodaté à l'heure de synchronisation (erreur corrigée)", deviceTime: null } });
      try {
        await syncLanDevice(db, d.id, { full: true });
        report.devicesResynced++;
        report.batchRemoved += suspects.length;
        for (const s of suspects) touch(s.employeeId, s.timestamp);
      } catch {
        // clock unreachable: put the rows back, we cannot replace them
        await db.punch.updateMany({ where: { id: { in: suspects.map((s) => s.id) } }, data: { deletedAt: null, reason: null } });
        for (const s of suspects) await db.punch.update({ where: { id: s.id }, data: { deviceTime: s.timestamp } }).catch(() => {});
        report.devicesUnreachable.push(d.name);
      }
    } catch {
      report.devicesUnreachable.push(d.name);
    }
  }

  // 3. Repeats within the anti-repeat window (per employee, or per unlinked ID).
  const w = (org.punchDedupMinutes || 10) * 60_000;
  const all = await db.punch.findMany({ where: { organizationId, deletedAt: null, source: { in: ["DEVICE", "TABLET"] } }, orderBy: { timestamp: "asc" }, select: { id: true, employeeId: true, deviceUserId: true, timestamp: true } });
  const last = new Map<string, number>();
  for (const p of all) {
    const who = p.employeeId ?? `pin:${p.deviceUserId}`;
    const prev = last.get(who);
    if (prev !== undefined && p.timestamp.getTime() - prev < w) {
      await db.punch.update({ where: { id: p.id }, data: { deletedAt: new Date(), reason: `Doublon (moins de ${w / 60_000} min après le précédent)` } });
      report.repeatsRemoved++;
      touch(p.employeeId, p.timestamp);
      continue;
    }
    last.set(who, p.timestamp.getTime());
  }

  // 4. Recompute affected days.
  for (const [employeeId, days] of touched) {
    const sorted = [...days].sort();
    await recomputeAttendance(db, organizationId, employeeId, addDays(sorted[0]!, -1), sorted[sorted.length - 1]!);
  }
  return { ...report, employees: touched.size };
}
