/**
 * YGHR worker (BullMQ + Redis).
 *  - device-poll        every minute : download logs from LAN ZKTeco devices
 *  - device-heartbeat   every 2 min  : mark silent devices offline and alert RH once
 *  - attendance-close   03:00 daily  : recompute yesterday (closes open days → "sortie manquante")
 *  - anomaly-scan       06:00 daily  : warn RH about blocking anomalies in the next 14 days
 *  - daily-digest       07:00 daily  : e-mail summary to RH of organisations with "Emails quotidiens"
 */
import path from "node:path";
import { config } from "dotenv";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import { addDays, blockingAnomalies, effectiveFeatures, LEAVE_TYPE_LABELS } from "@yghr/core";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const { prisma, syncLanDevice, recomputeOrgAttendance, analyzeOrgPlanning, todayIn, dbDate } = await import("@yghr/db");

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const QUEUE = "yghr";
const queue = new Queue(QUEUE, { connection });
const TZ = "Africa/Casablanca";

async function emit(organizationId: string, event: string, payload: unknown, userId?: string) {
  const url = process.env.REALTIME_INTERNAL_URL ?? `http://localhost:${process.env.REALTIME_PORT ?? 3001}`;
  await fetch(`${url}/internal/emit`, { method: "POST", headers: { "content-type": "application/json", "x-internal-secret": process.env.REALTIME_INTERNAL_SECRET ?? "" }, body: JSON.stringify({ organizationId, event, payload, userId }), signal: AbortSignal.timeout(1500) }).catch(() => {});
}
async function notifyRh(organizationId: string, n: { type: string; title: string; body: string; link?: string }) {
  const rh = await prisma.membership.findMany({ where: { organizationId, role: "RH", active: true }, select: { userId: true } });
  if (!rh.length) return;
  await prisma.notification.createMany({ data: rh.map((r) => ({ organizationId, userId: r.userId, ...n })) });
  for (const r of rh) await emit(organizationId, "notification:new", n, r.userId);
  // Phone / desktop notifications are sent by the web app (it holds the Web Push keys).
  await fetch(`${process.env.WEB_INTERNAL_URL ?? "http://localhost:3000"}/api/internal/push`, { method: "POST", headers: { "content-type": "application/json", "x-internal-secret": process.env.REALTIME_INTERNAL_SECRET ?? "" }, body: JSON.stringify({ userIds: rh.map((r) => r.userId), title: n.title, body: n.body, link: n.link }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}
const mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? "localhost", port: Number(process.env.SMTP_PORT ?? 1025), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  async "device-poll"() {
    const devices = await prisma.device.findMany({ where: { mode: "LAN", ip: { not: null } } });
    let created = 0;
    for (const d of devices) {
      try {
        const r = await syncLanDevice(prisma, d.id);
        created += r.created;
        for (const p of r.punches) if (p) await emit(d.organizationId, "punch:new", { id: p.id, name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : `ID inconnu #${p.deviceUserId}`, at: p.timestamp.toISOString(), device: d.name });
        if (d.status !== "ONLINE") await emit(d.organizationId, "device:status", { id: d.id, status: "ONLINE" });
      } catch {
        if (d.status === "ONLINE") await emit(d.organizationId, "device:status", { id: d.id, status: "OFFLINE" });
      }
    }
    return { devices: devices.length, created };
  },
  async "device-heartbeat"() {
    const silent = await prisma.device.findMany({ where: { status: "ONLINE", lastSeenAt: { lt: new Date(Date.now() - 10 * 60_000) } } });
    for (const d of silent) {
      await prisma.device.update({ where: { id: d.id }, data: { status: "OFFLINE" } });
      await emit(d.organizationId, "device:status", { id: d.id, status: "OFFLINE" });
      await notifyRh(d.organizationId, { type: "device", title: "Pointeuse hors ligne", body: `« ${d.name} » ne répond plus depuis 10 minutes. Vérifiez son alimentation et son réseau.`, link: `/${(await prisma.organization.findUnique({ where: { id: d.organizationId } }))?.slug}/rh/pointeuses?tab=devices` });
    }
    return { offline: silent.length };
  },
  async "attendance-close"() {
    const orgs = await prisma.organization.findMany({ select: { id: true, timezone: true } });
    let days = 0;
    for (const o of orgs) {
      const y = addDays(todayIn(o.timezone), -1);
      days += await recomputeOrgAttendance(prisma, o.id, addDays(y, -1), y);
    }
    return { days };
  },
  async "anomaly-scan"() {
    const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, timezone: true, featureOverrides: true, plan: { select: { features: true } } } });
    for (const o of orgs) {
      if (!effectiveFeatures(o.plan.features, o.featureOverrides).includes("planning")) continue;
      const t = todayIn(o.timezone);
      const blocking = blockingAnomalies(await analyzeOrgPlanning(prisma, o.id, t, addDays(t, 13)));
      if (blocking.length) await notifyRh(o.id, { type: "planning", title: "Anomalies bloquantes à venir", body: `${blocking.length} anomalie(s) bloquante(s) dans le planning des 14 prochains jours (ex. ${blocking[0]!.title.toLowerCase()} le ${blocking[0]!.date.split("-").reverse().join("/")}).`, link: `/${o.slug}/rh/planning` });
    }
  },
  async "daily-digest"() {
    const orgs = await prisma.organization.findMany({ where: { dailyEmails: true } });
    for (const o of orgs) {
      const y = addDays(todayIn(o.timezone), -1);
      const [days, pending] = await Promise.all([
        prisma.attendanceDay.findMany({ where: { organizationId: o.id, date: dbDate(y) } }),
        prisma.leaveRequest.findMany({ where: { organizationId: o.id, status: "PENDING" }, include: { employee: true }, take: 10 }),
      ]);
      const present = days.filter((d) => d.firstIn).length;
      const late = days.filter((d) => d.lateMinutes > 0).length;
      const absent = days.filter((d) => d.status === "ABSENT").length;
      const missing = days.filter((d) => d.issues.includes("MISSING_OUT")).length;
      const rh = await prisma.membership.findMany({ where: { organizationId: o.id, role: "RH", active: true }, include: { user: true } });
      const html = `<div style="font-family:Arial,sans-serif;color:#14201F"><h2 style="color:#0A2342">Résumé du ${y.split("-").reverse().join("/")}, ${o.name}</h2><p>${present} présent(s) · ${late} retard(s) · ${absent} absent(s) · ${missing} sortie(s) manquante(s)</p>${pending.length ? `<h3>Congés en attente</h3><ul>${pending.map((p) => `<li>${p.employee.firstName} ${p.employee.lastName} : ${LEAVE_TYPE_LABELS[p.type]} (${p.days} j)</li>`).join("")}</ul>` : "<p>Aucune demande de congé en attente.</p>"}<p><a href="${process.env.APP_URL ?? "http://localhost:3000"}/${o.slug}/rh">Ouvrir YGHR</a></p></div>`;
      for (const m of rh) await mailer.sendMail({ from: process.env.MAIL_FROM ?? "YGHR <no-reply@yghr.ma>", to: m.user.email, subject: `YGHR · résumé du ${y.split("-").reverse().join("/")}`, html }).catch((e) => console.warn("[digest]", e.message));
    }
  },
};

const worker = new Worker(QUEUE, async (job) => handlers[job.name]?.(job), { connection, concurrency: 2 });
worker.on("completed", (job, r) => console.log(`[worker] ${job.name} terminé`, r ?? ""));
worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} en échec`, err.message));

// Repeatable schedules (idempotent: same job ids on every start).
await queue.upsertJobScheduler("device-poll", { every: 60_000 }, { name: "device-poll" });
await queue.upsertJobScheduler("device-heartbeat", { every: 120_000 }, { name: "device-heartbeat" });
await queue.upsertJobScheduler("attendance-close", { pattern: "0 3 * * *", tz: TZ }, { name: "attendance-close" });
await queue.upsertJobScheduler("anomaly-scan", { pattern: "0 6 * * *", tz: TZ }, { name: "anomaly-scan" });
await queue.upsertJobScheduler("daily-digest", { pattern: "0 7 * * *", tz: TZ }, { name: "daily-digest" });
console.log("[worker] prêt : tâches planifiées actives");

const shutdown = async () => { await worker.close(); await queue.close(); await connection.quit(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
