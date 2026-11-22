import "server-only";
import { prisma } from "@yghr/db";

let cache: { publicKey: string; privateKey: string } | null = null;

/**
 * Web Push (VAPID) keys. Uses VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (or NEXT_PUBLIC_VAPID_PUBLIC_KEY) when set;
 * otherwise generates a pair once and keeps it in the database, so push works with no configuration
 * and survives restarts and redeploys.
 */
export async function vapidKeys() {
  if (cache) return cache;
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) return (cache = { publicKey: pub, privateKey: priv });
  const row = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
  if (row) return (cache = JSON.parse(row.value) as { publicKey: string; privateKey: string });
  const wp = (await import("web-push")).default;
  const k = wp.generateVAPIDKeys();
  // Another instance may have created it at the same time: keep whichever is stored.
  const saved = await prisma.appSetting.upsert({ where: { key: "vapid" }, create: { key: "vapid", value: JSON.stringify(k) }, update: {} });
  return (cache = JSON.parse(saved.value) as { publicKey: string; privateKey: string });
}
