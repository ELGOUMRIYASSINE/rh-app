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
}

/**
 * Idempotent punch ingestion: deduplicated on (deviceId, deviceUserId, timestamp),
 * resolves the employee via DeviceUserMap, then recomputes the attendance day.
 * Returns the punch when it is new, null when it was a duplicate.
 */
export async function ingestPunch(db: PrismaClient, p: IncomingPunch) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: p.organizationId } });
  const ts = org.useServerTimeForPunches ? new Date() : p.timestamp;
  let employeeId = p.employeeId ?? null;
  if (!employeeId && p.deviceUserId) {
    const map = await db.deviceUserMap.findUnique({ where: { organizationId_deviceUserId: { organizationId: p.organizationId, deviceUserId: p.deviceUserId } } });
    employeeId = map?.employeeId ?? null;
  }
  if (p.deviceId && p.deviceUserId) {
    const dup = await db.punch.findUnique({ where: { deviceId_deviceUserId_timestamp: { deviceId: p.deviceId, deviceUserId: p.deviceUserId, timestamp: p.timestamp } } });
    if (dup) return null;
  }
  const punch = await db.punch.create({
    data: {
      organizationId: p.organizationId,
      deviceId: p.deviceId ?? null,
      deviceUserId: p.deviceUserId ?? null,
      employeeId,
      timestamp: org.useServerTimeForPunches ? ts : p.timestamp,
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
