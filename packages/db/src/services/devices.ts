import { createRequire } from "node:module";
import type { PrismaClient } from "../generated/prisma/client";
import { localDateTimeToUtc } from "../tz";
import { ingestPunch } from "./punches";

const require = createRequire(import.meta.url);

interface ZkClient {
  createSocket(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  getSerialNumber(): Promise<string>;
  getDeviceName(): Promise<string>;
  getFirmware(): Promise<string>;
  getInfo(): Promise<{ userCounts: number; logCounts: number }>;
  getAttendances(): Promise<{ data: { user_id: string | number; record_time: string | Date; state?: number; type?: number }[] }>;
  setTime(d: Date): Promise<unknown>;
  getTime(): Promise<Date>;
}

function client(ip: string, port: number): ZkClient {
  const Zk = require("zkteco-js") as new (ip: string, port: number, timeout: number, inport: number) => ZkClient;
  return new Zk(ip, port, 6000, 5200);
}

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\0/g, "").replace(/^~?\w+=/, "").trim() : v ? String(v) : null);

export class DeviceUnreachable extends Error {
  constructor() {
    super("Appareil injoignable : vérifiez l'IP, le port et que le serveur est sur le même réseau.");
  }
}

/**
 * Connect from the server and read the identity of a ZKTeco device (TCP 4370).
 * DECISION: the communication password (comm key) is stored but not sent; zkteco-js does not
 * implement CMD_AUTH. Devices with a comm key must have it cleared or use ADMS mode.
 */
export async function testDevice(ip: string, port = 4370) {
  const zk = client(ip, port);
  try {
    await withTimeout(zk.createSocket(), 8000);
    const [serialNumber, model, firmware, info] = await Promise.all([zk.getSerialNumber().catch(() => null), zk.getDeviceName().catch(() => null), zk.getFirmware().catch(() => null), zk.getInfo().catch(() => null)]);
    return { serialNumber: clean(serialNumber), model: clean(model), firmware: clean(firmware), userCount: info?.userCounts ?? null, logCount: info?.logCounts ?? null };
  } catch {
    throw new DeviceUnreachable();
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** Device clock → org wall time → UTC. zkteco-js builds Dates from local components. */
function deviceTimeToUtc(t: string | Date, timeZone: string): Date {
  const d = new Date(t);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return new Date(localDateTimeToUtc(date, hm, timeZone).getTime() + d.getSeconds() * 1000);
}

/** Poll a LAN device: download logs, ingest new punches (deduplicated), update status. */
export async function syncLanDevice(db: PrismaClient, deviceId: string): Promise<{ received: number; created: number; punches: Awaited<ReturnType<typeof ingestPunch>>[] }> {
  const device = await db.device.findUniqueOrThrow({ where: { id: deviceId }, include: { organization: true } });
  if (device.mode !== "LAN" || !device.ip) throw new Error("Synchronisation disponible uniquement pour les pointeuses LAN.");
  const zk = client(device.ip, device.port);
  const created: Awaited<ReturnType<typeof ingestPunch>>[] = [];
  try {
    await withTimeout(zk.createSocket(), 8000);
    const logs = (await zk.getAttendances()).data ?? [];
    // Only the last 45 days: older logs were already ingested or are irrelevant.
    const since = Date.now() - 45 * 86400_000;
    for (const l of logs) {
      const ts = deviceTimeToUtc(l.record_time, device.organization.timezone);
      if (ts.getTime() < since) continue;
      const p = await ingestPunch(db, { organizationId: device.organizationId, deviceId: device.id, deviceUserId: String(l.user_id), timestamp: ts, source: "DEVICE", verifyMode: l.type !== undefined ? String(l.type) : null, rawPayload: { state: l.state, type: l.type } });
      if (p) created.push(p);
    }
    await db.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: new Date() } });
    return { received: logs.length, created: created.length, punches: created };
  } catch (e) {
    await db.device.update({ where: { id: device.id }, data: { status: "OFFLINE" } });
    throw e instanceof DeviceUnreachable ? e : new DeviceUnreachable();
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

export async function setDeviceTime(db: PrismaClient, deviceId: string) {
  const device = await db.device.findUniqueOrThrow({ where: { id: deviceId }, include: { organization: true } });
  if (!device.ip) throw new Error("Adresse IP manquante.");
  const zk = client(device.ip, device.port);
  try {
    await withTimeout(zk.createSocket(), 8000);
    // Send the org wall-clock time as local components (the device has no timezone).
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: device.organization.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    await zk.setTime(new Date(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")));
  } catch {
    throw new DeviceUnreachable();
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

/**
 * ADMS / iClock ATTLOG lines: "PIN\tYYYY-MM-DD HH:MM:SS\tstatus\tverify\tworkcode\t…".
 * Returns the newly created punches.
 */
export async function ingestAttlog(db: PrismaClient, deviceId: string, body: string) {
  const device = await db.device.findUniqueOrThrow({ where: { id: deviceId }, include: { organization: true } });
  const created: NonNullable<Awaited<ReturnType<typeof ingestPunch>>>[] = [];
  let lines = 0;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [pin, stamp, status, verify] = line.split("\t");
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp ?? "");
    if (!pin || !m) continue;
    lines++;
    const ts = new Date(localDateTimeToUtc(m[1]!, `${m[2]}:${m[3]}`, device.organization.timezone).getTime() + Number(m[4]) * 1000);
    const VERIFY: Record<string, string> = { "0": "Mot de passe", "1": "Empreinte", "2": "Carte", "15": "Visage", "4": "Carte" };
    const p = await ingestPunch(db, {
      organizationId: device.organizationId,
      deviceId: device.id,
      deviceUserId: pin,
      timestamp: ts,
      source: "DEVICE",
      verifyMode: VERIFY[verify ?? ""] ?? verify ?? null,
      direction: status === "0" ? "IN" : status === "1" ? "OUT" : null,
      rawPayload: { line },
    });
    if (p) created.push(p);
  }
  await db.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: created.length ? new Date() : undefined } });
  return { lines, created };
}
