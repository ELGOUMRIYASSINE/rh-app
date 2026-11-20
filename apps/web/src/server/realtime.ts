import "server-only";
import { prisma } from "@yghr/db";

export type RealtimeEvent =
  | "punch:new"
  | "attendance:update"
  | "device:status"
  | "device:users"
  | "notification:new"
  | "leave:updated"
  | "planning:published"
  | "message:new";

/** Publish an event to the Socket.IO server (room org:{id}). Fire-and-forget. */
export async function emit(organizationId: string, event: RealtimeEvent, payload: unknown = {}, userId?: string) {
  const url = process.env.REALTIME_INTERNAL_URL ?? `http://localhost:${process.env.REALTIME_PORT ?? 3001}`;
  try {
    await fetch(`${url}/internal/emit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": process.env.REALTIME_INTERNAL_SECRET ?? "" },
      body: JSON.stringify({ organizationId, event, payload, userId }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // realtime server down: clients fall back to polling
  }
}

/** Create in-app notifications, push them live (socket) and to subscribed devices (Web Push). */
export async function notify(organizationId: string, userIds: string[], n: { type: string; title: string; body: string; link?: string }) {
  if (!userIds.length) return;
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ organizationId, userId, ...n })) });
  await Promise.all(userIds.map((u) => emit(organizationId, "notification:new", n, u)));
  void webPush(userIds, n);
}

async function webPush(userIds: string[], n: { title: string; body: string; link?: string }) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  try {
    const wp = (await import("web-push")).default;
    wp.setVapidDetails(`mailto:${process.env.SALES_EMAIL ?? "no-reply@yghr.ma"}`, pub, priv);
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    await Promise.all(subs.map((s) => wp.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify(n)).catch(async (e: { statusCode?: number }) => {
      if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    })));
  } catch (e) {
    console.warn("[push]", (e as Error).message);
  }
}

/** User ids of the RH members of an organisation. */
export async function rhUserIds(organizationId: string): Promise<string[]> {
  return (await prisma.membership.findMany({ where: { organizationId, role: "RH", active: true }, select: { userId: true } })).map((m) => m.userId);
}
