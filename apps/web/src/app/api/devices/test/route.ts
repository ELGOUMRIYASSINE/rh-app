import { z } from "zod";
import { DeviceUnreachable, testDevice } from "@yghr/db";
import { fail, route } from "@/server/api";
import { rateLimit } from "@/server/rate-limit";

export const POST = route({ feature: "devices", rhOnly: true, body: z.object({ ip: z.string().min(3).max(100), port: z.number().int().min(1).max(65535).default(4370), password: z.string().max(20).nullable().optional() }) }, async ({ s, body }) => {
  if (!rateLimit(`devtest:${s.org.id}`, 10, 60_000).ok) fail(429, "Trop de tests, patientez une minute.");
  try {
    return { ok: true, info: await testDevice(body.ip, body.port) };
  } catch (e) {
    fail(502, e instanceof DeviceUnreachable ? e.message : "Appareil injoignable.");
  }
});
