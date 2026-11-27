import "server-only";

/**
 * DECISION: in-memory sliding window, per process. Good enough for a single web instance;
 * move to Redis (INCR + EXPIRE) when running several replicas.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return { ok: true, retryAfter: 0 };
}

/** Check without recording (used to count only failures, e.g. login). */
export function rateLimitPeek(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  return { ok: true, retryAfter: 0 };
}
export function rateLimitHit(key: string) {
  buckets.set(key, [...(buckets.get(key) ?? []), Date.now()]);
}
