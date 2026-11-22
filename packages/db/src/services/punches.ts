import type { PrismaClient, PunchSource } from "../generated/prisma/client";
import { fromDbDate, todayIn } from "../tz";
import { recomputeAttendance } from "./attendance";
import { addDays } from "@yghr/core";

export interface IncomingPunch {
  organizationId: string;
  deviceId?: string | null;
  deviceUserId?: string | null;
  employeeId?: string | null;
  /** Device clock time. */
  timestamp: Date;
  source: PunchSource;
  verifyMode?: string | null;
  direction?: string | null;
  state?: string | null;
  workCode?: string | null;
  rawPayload?: object;
  /** Sent by the clock the moment it happened (real-time push), not part of a batch / history import. */
  live?: boolean;
  /** Known offset of the device clock (device − real), applied when the org trusts the server time. */
  driftSeconds?: number | null;
}

/**
 * Idempotent punch ingestion.
 * - A clock-in already received is recognised by (deviceId, deviceUserId, deviceTime): the clock's own time,
 *   never the server time, so re-reading a device's history never creates copies.
 * - "Use server time": only a live clock-in takes the reception time; imported history is corrected by the
 *   known clock drift instead (it would otherwise all get the import time).
 * - Anti-repeat: a clock-in of the same person within `punchDedupMinutes` of another one is ignored.
 * Resolves the employee via DeviceUserMap and recomputes the attendance day.
 * Returns the punch when it is new, null when it was a duplicate or a repeat.
 */
export async function ingestPunch(db: PrismaClient, p: IncomingPunch) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: p.organizationId }, select: { timezone: true, useServerTimeForPunches: true, punchDedupMinutes: true } });
  if (p.deviceId && p.deviceUserId) {
    const dup = await db.punch.findUnique({ where: { deviceId_deviceUserId_deviceTime: { deviceId: p.deviceId, deviceUserId: p.deviceUserId, deviceTime: p.timestamp } } });
    if (dup) return null;
  }
  let ts = p.timestamp;
  if (org.useServerTimeForPunches && p.source === "DEVICE") {
    if (p.live) ts = new Date();
    else if (p.driftSeconds) ts = new Date(p.timestamp.getTime() - p.driftSeconds * 1000);
  }
  let employeeId = p.employeeId ?? null;
  if (!employeeId && p.deviceUserId) {
    const map = await db.deviceUserMap.findUnique({ where: { organizationId_deviceUserId: { organizationId: p.organizationId, deviceUserId: p.deviceUserId } } });
    employeeId = map?.employeeId ?? null;
  }
  // Anti-repeat: the same person badging again within the window (double tap, spam, clock retry).
  if (org.punchDedupMinutes > 0 && p.source !== "CORRECTION" && (employeeId || p.deviceUserId)) {
    const w = org.punchDedupMinutes * 60_000;
    const near = await db.punch.findFirst({
      where: {
        organizationId: p.organizationId, deletedAt: null,
        ...(employeeId ? { employeeId } : { deviceUserId: p.deviceUserId, employeeId: null }),
        timestamp: { gt: new Date(ts.getTime() - w), lt: new Date(ts.getTime() + w) },
      },
      select: { id: true },
    });
    if (near) return null;
  }
  const punch = await db.punch.create({
    data: {
      organizationId: p.organizationId,
      deviceId: p.deviceId ?? null,
      deviceUserId: p.deviceUserId ?? null,
      employeeId,
      timestamp: ts,
      deviceTime: p.deviceId ? p.timestamp : null,
      source: p.source,
      verifyMode: p.verifyMode ?? null,
      direction: p.direction ?? null,
      state: p.state ?? null,
      workCode: p.workCode ?? null,
      rawPayload: p.rawPayload,
    },
    include: { employee: { select: { firstName: true, lastName: true } }, device: { select: { name: true } } },
  });
  if (employeeId) {
    const day = todayIn(org.timezone, punch.timestamp);
    await recomputeAttendance(db, p.organizationId, employeeId, addDays(day, -1), day);
  }
  return punch;
}

/** Map a fingerprint ID to an employee, back-fill past punches and recompute their days. */
export async function mapDeviceUser(db: PrismaClient, organizationId: string, deviceUserId: string, employeeId: string) {
  await db.deviceUserMap.upsert({
    where: { organizationId_deviceUserId: { organizationId, deviceUserId } },
    create: { organizationId, deviceUserId, employeeId },
    update: { employeeId },
  });
  const punches = await db.punch.findMany({ where: { organizationId, deviceUserId, employeeId: null }, select: { timestamp: true } });
  await db.punch.updateMany({ where: { organizationId, deviceUserId, employeeId: null }, data: { employeeId } });
  if (punches.length) {
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const dates = punches.map((p) => todayIn(org.timezone, p.timestamp)).sort();
    await recomputeAttendance(db, organizationId, employeeId, addDays(dates[0]!, -1), dates[dates.length - 1]!);
  }
  return punches.length;
}

export { fromDbDate };
