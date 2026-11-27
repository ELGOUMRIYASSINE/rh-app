import "server-only";
import { z } from "zod";

export const TabletRules = z.object({
  allowedIps: z.array(z.string().regex(/^[0-9a-fA-F.:/]+$/, "Plage IP invalide")).max(20).default([]),
  photoRequired: z.boolean().default(false),
  geofence: z.object({ lat: z.number(), lng: z.number(), radiusMeters: z.number().int().min(20).max(5000) }).nullable().default(null),
});

