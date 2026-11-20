import { createRequire } from "node:module";
import type { PrismaClient } from "../generated/prisma/client";
import { localDateTimeToUtc } from "../tz";
import { ingestPunch, mapDeviceUser } from "./punches";

const require = createRequire(import.meta.url);

interface ZkUser { uid: number; role: number; password?: string; name: string; cardno?: number; userId: string }
interface ZkClient {
  createSocket(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  getSerialNumber(): Promise<string>;
  getDeviceName(): Promise<string>;
  getFirmware(): Promise<string>;
  getPlatform(): Promise<string>;
  getMacAddress(): Promise<string>;
  getInfo(): Promise<{ userCounts: number; logCounts: number }>;
  executeCmd(command: number, data?: string): Promise<Buffer>;
  getUsers(): Promise<{ data: ZkUser[] }>;
  getAttendances(): Promise<{ data: { user_id: string | number; record_time: string | Date; state?: number; type?: number }[] }>;
  setTime(d: Date): Promise<unknown>;
  getTime(): Promise<Date>;
}

function client(ip: string, port: number): ZkClient {
  const Zk = require("zkteco-js") as new (ip: string, port: number, timeout: number, inport: number) => ZkClient;
  return new Zk(ip, port, 6000, 5200);
}

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\0/g, "").replace(/^~?\w+=/, "").trim() || null : v ? String(v) : null);

// ───────── ZKTeco codes ─────────
/** Punch state (the key pressed on the clock). */
export const PUNCH_STATE: Record<string, { label: string; direction: "IN" | "OUT" }> = {
  "0": { label: "Entrée", direction: "IN" },
  "1": { label: "Sortie", direction: "OUT" },
  "2": { label: "Début de pause", direction: "OUT" },
  "3": { label: "Fin de pause", direction: "IN" },
  "4": { label: "Entrée heures sup", direction: "IN" },
  "5": { label: "Sortie heures sup", direction: "OUT" },
};
/** How the person was identified. */
export const VERIFY_MODE: Record<string, string> = { "0": "Mot de passe", "1": "Empreinte", "2": "Carte", "3": "Mot de passe", "4": "Carte", "15": "Visage", "25": "Paume" };

export class DeviceUnreachable extends Error {
  constructor() {
    super("Appareil injoignable : vérifiez l'IP, le port et que le serveur est sur le même réseau.");
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/**
 * Device capacity and counts (CMD_GET_FREE_SIZES = 50). Reply = 8-byte header + int32 fields:
 * users @16, fingerprints @24, records @32, cards @48, fp capacity @56, user capacity @60, record capacity @64, faces @80.
 */
async function readSizes(zk: ZkClient) {
  try {
    const b = await zk.executeCmd(50, "");
    const at = (o: number) => (b.length >= 8 + o + 4 ? b.readInt32LE(8 + o) : null);
    return { userCount: at(16), fingerprintCount: at(24), logCount: at(32), fingerprintCapacity: at(56), userCapacity: at(60), logCapacity: at(64), faceCount: at(80) };
  } catch {
    const i = await zk.getInfo().catch(() => null);
    return { userCount: i?.userCounts ?? null, logCount: i?.logCounts ?? null, fingerprintCount: null, fingerprintCapacity: null, userCapacity: null, logCapacity: null, faceCount: null };
  }
}

/** Identity + counts of a device. Used by the connection test and every sync. */
async function readIdentity(zk: ZkClient) {
  const [serialNumber, model, firmware, platform, mac, sizes, time] = await Promise.all([
    zk.getSerialNumber().catch(() => null), zk.getDeviceName().catch(() => null), zk.getFirmware().catch(() => null),
    zk.getPlatform().catch(() => null), zk.getMacAddress().catch(() => null), readSizes(zk), zk.getTime().catch(() => null),
  ]);
  return { serialNumber: clean(serialNumber), model: clean(model), firmware: clean(firmware), platform: clean(platform), macAddress: clean(mac), ...sizes, deviceTime: time instanceof Date && !Number.isNaN(time.getTime()) ? time : null };
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
    const id = await readIdentity(zk);
    return { serialNumber: id.serialNumber, model: id.model, firmware: id.firmware, userCount: id.userCount, logCount: id.logCount, fingerprintCount: id.fingerprintCount, faceCount: id.faceCount };
  } catch {
    throw new DeviceUnreachable();
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

/** Device clock → org wall time → UTC. zkteco-js builds Dates from local components. */
function deviceTimeToUtc(t: string | Date, timeZone: string): Date {
  const d = new Date(t);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return new Date(localDateTimeToUtc(date, hm, timeZone).getTime() + d.getSeconds() * 1000);
}

/** Upsert the users stored in a device (names, privileges, credentials). */
async function saveDeviceUsers(db: PrismaClient, device: { id: string; organizationId: string }, users: { pin: string; name?: string | null; role?: number; card?: string | null; hasPassword?: boolean; fingerprints?: number; hasFace?: boolean }[]) {
  for (const u of users) {
    if (!u.pin) continue;
    const data = {
      ...(u.name !== undefined ? { name: u.name?.trim() || null } : {}),
      ...(u.role !== undefined ? { role: u.role } : {}),
      ...(u.card !== undefined ? { cardNumber: u.card && u.card !== "0" ? u.card : null } : {}),
      ...(u.hasPassword !== undefined ? { hasPassword: u.hasPassword } : {}),
      ...(u.fingerprints !== undefined ? { fingerprints: u.fingerprints } : {}),
      ...(u.hasFace !== undefined ? { hasFace: u.hasFace } : {}),
    };
    await db.deviceUser.upsert({ where: { deviceId_deviceUserId: { deviceId: device.id, deviceUserId: u.pin } }, create: { organizationId: device.organizationId, deviceId: device.id, deviceUserId: u.pin, ...data }, update: data });
  }
}

/**
 * Poll a LAN device: identity and counts, the users stored in it (names), then attendance logs
 * (deduplicated). `full` imports the whole history instead of the last 45 days.
 */
export async function syncLanDevice(db: PrismaClient, deviceId: string, opts: { full?: boolean } = {}): Promise<{ received: number; created: number; users: number; linked: number; punches: Awaited<ReturnType<typeof ingestPunch>>[] }> {
  const device = await db.device.findUniqueOrThrow({ where: { id: deviceId }, include: { organization: true } });
  if (device.mode !== "LAN" || !device.ip) throw new Error("Synchronisation disponible uniquement pour les pointeuses LAN.");
  const zk = client(device.ip, device.port);
  const created: Awaited<ReturnType<typeof ingestPunch>>[] = [];
  try {
    await withTimeout(zk.createSocket(), 8000);
    const id = await readIdentity(zk);
    // Users stored in the clock: PIN + name + privilege + card/password.
    let userCount = 0;
    const users = (await zk.getUsers().catch(() => null))?.data ?? null;
    if (users) {
      await saveDeviceUsers(db, device, users.map((u) => ({ pin: String(u.userId || u.uid), name: clean(u.name), role: u.role ?? 0, card: u.cardno ? String(u.cardno) : null, hasPassword: !!clean(u.password) })));
      userCount = users.length;
    }
    const logs = (await zk.getAttendances()).data ?? [];
    const since = opts.full ? 0 : Date.now() - 45 * 86400_000;
    for (const l of logs) {
      const ts = deviceTimeToUtc(l.record_time, device.organization.timezone);
      if (ts.getTime() < since || Number.isNaN(ts.getTime())) continue;
      const st = l.state !== undefined ? PUNCH_STATE[String(l.state)] : undefined;
      const p = await ingestPunch(db, {
        organizationId: device.organizationId, deviceId: device.id, deviceUserId: String(l.user_id), timestamp: ts, source: "DEVICE",
        verifyMode: l.type !== undefined ? (VERIFY_MODE[String(l.type)] ?? `Code ${l.type}`) : null,
        direction: st?.direction ?? null, state: st?.label ?? null,
        rawPayload: { state: l.state, type: l.type },
      });
      if (p) created.push(p);
    }
    const drift = id.deviceTime ? Math.round((deviceTimeToUtc(id.deviceTime, device.organization.timezone).getTime() - Date.now()) / 1000) : null;
    await db.device.update({
      where: { id: device.id },
      data: {
        status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: new Date(), lastError: null,
        serialNumber: device.serialNumber ?? id.serialNumber, model: id.model ?? device.model, firmware: id.firmware ?? device.firmware, platform: id.platform, macAddress: id.macAddress,
        userCount: id.userCount ?? userCount, fingerprintCount: id.fingerprintCount, faceCount: id.faceCount, logCount: id.logCount ?? logs.length,
        userCapacity: id.userCapacity, fingerprintCapacity: id.fingerprintCapacity, logCapacity: id.logCapacity, clockDriftSeconds: drift,
        ...(users ? { usersSyncedAt: new Date() } : {}),
      },
    });
    const linked = await autoLinkDeviceUsers(db, device.organizationId);
    return { received: logs.length, created: created.length, users: userCount, linked, punches: created };
  } catch (e) {
    await db.device.update({ where: { id: device.id }, data: { status: "OFFLINE", lastError: (e as Error).message?.slice(0, 300) ?? null } });
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
    await db.device.update({ where: { id: device.id }, data: { clockDriftSeconds: 0 } });
  } catch {
    throw new DeviceUnreachable();
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

// ───────── ADMS (push) ─────────

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
    const [pin, stamp, status, verify, workcode] = line.split("\t");
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp ?? "");
    if (!pin || !m) continue;
    lines++;
    const ts = new Date(localDateTimeToUtc(m[1]!, `${m[2]}:${m[3]}`, device.organization.timezone).getTime() + Number(m[4]) * 1000);
    const st = PUNCH_STATE[status ?? ""];
    const p = await ingestPunch(db, {
      organizationId: device.organizationId,
      deviceId: device.id,
      deviceUserId: pin,
      timestamp: ts,
      source: "DEVICE",
      verifyMode: VERIFY_MODE[verify ?? ""] ?? (verify ? `Code ${verify}` : null),
      direction: st?.direction ?? null,
      state: st?.label ?? null,
      workCode: workcode && workcode !== "0" ? workcode : null,
      rawPayload: { line },
    });
    if (p) created.push(p);
  }
  await db.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: created.length ? new Date() : undefined } });
  return { lines, created };
}

/** "KEY=value\tKEY2=value" → object (keys upper-cased). */
function kv(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of s.split(/\t|&/)) {
    const i = part.indexOf("=");
    if (i > 0) o[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
  }
  return o;
}

/**
 * User data pushed by ADMS devices (table OPERLOG / USERINFO / BIODATA / FINGERTMP):
 *   USER PIN=1\tName=Hamza\tPri=0\tPasswd=\tCard=\tGrp=1
 *   FP PIN=1\tFID=6\tSize=1184\tValid=1\tTMP=…
 *   FACE PIN=1\tFID=0\t…            BIODATA Pin=1\tNo=0\tIndex=0\tValid=1\tType=1\t…
 */
export async function ingestUserData(db: PrismaClient, deviceId: string, body: string) {
  const device = await db.device.findUniqueOrThrow({ where: { id: deviceId } });
  const users = new Map<string, { pin: string; name?: string | null; role?: number; card?: string | null; hasPassword?: boolean }>();
  const fps = new Map<string, Set<string>>();
  const faces = new Set<string>();
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sp = line.indexOf(" ");
    const head = sp > 0 && !line.slice(0, sp).includes("=") ? line.slice(0, sp).toUpperCase() : "USER";
    const f = kv(head === "USER" && !line.startsWith("USER") ? line : line.slice(sp + 1));
    const pin = f.PIN ?? f.PIN2;
    if (!pin) continue;
    if (head === "USER") users.set(pin, { pin, name: f.NAME ?? null, role: f.PRI ? Number(f.PRI) || 0 : 0, card: f.CARD ? f.CARD.replace(/^\[|\]$/g, "") || null : null, hasPassword: !!f.PASSWD });
    else if (head === "FP" || head === "FINGERTMP") (fps.get(pin) ?? fps.set(pin, new Set()).get(pin)!).add(f.FID ?? String(fps.get(pin)?.size ?? 0));
    else if (head === "FACE") faces.add(pin);
    else if (head === "BIODATA") {
      if (f.TYPE === "1") (fps.get(pin) ?? fps.set(pin, new Set()).get(pin)!).add(f.NO ?? "0");
      else if (f.TYPE === "2" || f.TYPE === "9") faces.add(pin);
    }
  }
  const all = new Set([...users.keys(), ...fps.keys(), ...faces]);
  await saveDeviceUsers(db, device, [...all].map((pin) => ({ ...(users.get(pin) ?? { pin }), ...(fps.has(pin) ? { fingerprints: fps.get(pin)!.size } : {}), ...(faces.has(pin) ? { hasFace: true } : {}) })));
  if (users.size) await db.device.update({ where: { id: device.id }, data: { usersSyncedAt: new Date() } });
  const linked = users.size ? await autoLinkDeviceUsers(db, device.organizationId) : 0;
  return { users: users.size, fingerprints: fps.size, faces: faces.size, linked, lines: body.split(/\r?\n/).filter(Boolean).length };
}

/**
 * INFO reported by ADMS devices, either as the getrequest query string
 * ("Ver 6.60,users,fingerprints,logs,ip,fpVer,faceVer,faceTpl,faces,…") or as key=value lines.
 */
export async function ingestDeviceInfo(db: PrismaClient, deviceId: string, info: string) {
  const data: Record<string, unknown> = {};
  if (info.includes("=")) {
    const f = kv(info.replace(/\r?\n/g, "\t").replace(/^~/gm, ""));
    const n = (k: string) => (f[k] !== undefined && !Number.isNaN(Number(f[k])) ? Number(f[k]) : undefined);
    Object.assign(data, {
      firmware: f.FWVERSION ?? f["~FWVERSION"], model: f["~DEVICENAME"] ?? f.DEVICENAME, macAddress: f.MAC, reportedIp: f.IPADDRESS,
      userCount: n("USERCOUNT"), fingerprintCount: n("FPCOUNT"), logCount: n("TRANSACTIONCOUNT"), faceCount: n("FACECOUNT"), platform: f["~PLATFORM"] ?? f.PLATFORM,
    });
  } else {
    const [ver, users, fps, logs, ip, , , , faces] = info.split(",");
    const n = (v?: string) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);
    Object.assign(data, { firmware: ver?.trim() || undefined, userCount: n(users), fingerprintCount: n(fps), logCount: n(logs), reportedIp: ip?.trim() || undefined, faceCount: n(faces) });
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (Object.keys(data).length) await db.device.update({ where: { id: deviceId }, data });
}

export const ADMS_COMMANDS = {
  users: { command: "DATA QUERY USERINFO", label: "Récupérer les utilisateurs et leurs noms" },
  history: { command: "DATA QUERY ATTLOG StartTime=2000-01-01 00:00:00\tEndTime=2099-12-31 23:59:59", label: "Renvoyer tout l'historique des pointages" },
  info: { command: "INFO", label: "Lire les informations de la pointeuse" },
  check: { command: "CHECK", label: "Envoyer les nouvelles données" },
  reboot: { command: "REBOOT", label: "Redémarrer la pointeuse" },
} as const;
export type AdmsCommand = keyof typeof ADMS_COMMANDS;

export async function queueDeviceCommand(db: PrismaClient, deviceId: string, kind: AdmsCommand) {
  const c = ADMS_COMMANDS[kind];
  const existing = await db.deviceCommand.findFirst({ where: { deviceId, command: c.command, status: { in: ["PENDING", "SENT"] } } });
  if (existing) return existing;
  return db.deviceCommand.create({ data: { deviceId, command: c.command, label: c.label } });
}

/** Commands to hand to the device on its poll ("C:<seq>:<command>" lines), marked as sent. */
export async function takePendingCommands(db: PrismaClient, deviceId: string) {
  const cmds = await db.deviceCommand.findMany({ where: { deviceId, status: "PENDING" }, orderBy: { seq: "asc" }, take: 5 });
  if (cmds.length) await db.deviceCommand.updateMany({ where: { id: { in: cmds.map((c) => c.id) } }, data: { status: "SENT", sentAt: new Date() } });
  return cmds.map((c) => `C:${c.seq}:${c.command}`);
}

/** Results posted to /iclock/devicecmd: "ID=12&Return=0&CMD=DATA" (one per line), optionally followed by INFO lines. */
export async function ingestCommandResults(db: PrismaClient, deviceId: string, body: string) {
  let done = 0;
  for (const line of body.split(/\r?\n/)) {
    const f = kv(line);
    if (!f.ID || f.RETURN === undefined) continue;
    const seq = Number(f.ID);
    if (!Number.isInteger(seq)) continue;
    const ok = Number(f.RETURN) >= 0;
    const r = await db.deviceCommand.updateMany({ where: { deviceId, seq }, data: { status: ok ? "DONE" : "FAILED", result: `Return=${f.RETURN}${f.CMD ? ` · ${f.CMD}` : ""}`, doneAt: new Date() } });
    done += r.count;
  }
  if (/(UserCount|FPCount|TransactionCount|FWVersion|DeviceName)=/i.test(body)) await ingestDeviceInfo(db, deviceId, body);
  return done;
}

// ───────── Linking device users to employees ─────────

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameKeys = (first: string, last: string) => [norm(`${first} ${last}`), norm(`${last} ${first}`)];
const digits = (s: string | null | undefined) => (s ? s.replace(/\D/g, "").replace(/^0+/, "") : "");

/**
 * Link device users that are not linked yet to employees whose name (either order, accents ignored)
 * or matricule matches. Only unambiguous matches are linked. Returns the number of new links.
 */
export async function autoLinkDeviceUsers(db: PrismaClient, organizationId: string) {
  const [users, maps, employees] = await Promise.all([
    db.deviceUser.findMany({ where: { organizationId }, select: { deviceUserId: true, name: true } }),
    db.deviceUserMap.findMany({ where: { organizationId }, select: { deviceUserId: true, employeeId: true } }),
    db.employee.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, matricule: true } }),
  ]);
  const mappedPins = new Set(maps.map((m) => m.deviceUserId));
  const mappedEmps = new Set(maps.map((m) => m.employeeId));
  const byName = new Map<string, string[]>();
  for (const e of employees) for (const k of nameKeys(e.firstName, e.lastName)) byName.set(k, [...new Set([...(byName.get(k) ?? []), e.id])]);
  let linked = 0;
  const seen = new Set<string>();
  for (const u of users) {
    if (mappedPins.has(u.deviceUserId) || seen.has(u.deviceUserId)) continue;
    seen.add(u.deviceUserId);
    let candidates = u.name ? (byName.get(norm(u.name)) ?? []) : [];
    if (!candidates.length) candidates = employees.filter((e) => e.matricule && (e.matricule === u.deviceUserId || (digits(e.matricule) && digits(e.matricule) === digits(u.deviceUserId)))).map((e) => e.id);
    candidates = candidates.filter((id) => !mappedEmps.has(id));
    if (candidates.length !== 1) continue;
    await mapDeviceUser(db, organizationId, u.deviceUserId, candidates[0]!);
    mappedEmps.add(candidates[0]!);
    linked++;
  }
  return linked;
}

/** Suggested employee for an unlinked device user (same rules as auto-link, but also partial name match). */
export function suggestEmployee(name: string | null, pin: string, employees: { id: string; firstName: string; lastName: string; matricule: string | null }[]) {
  if (name) {
    const n = norm(name);
    const exact = employees.filter((e) => nameKeys(e.firstName, e.lastName).includes(n));
    if (exact.length === 1) return exact[0]!.id;
    const words = new Set(n.split(" ").filter((w) => w.length > 2));
    const partial = employees.filter((e) => norm(e.lastName).split(" ").some((w) => words.has(w)) && norm(e.firstName).split(" ").some((w) => words.has(w) || [...words].some((x) => x.startsWith(w.slice(0, 3)))));
    if (partial.length === 1) return partial[0]!.id;
  }
  const m = employees.filter((e) => e.matricule && digits(e.matricule) && digits(e.matricule) === digits(pin));
  return m.length === 1 ? m[0]!.id : null;
}
