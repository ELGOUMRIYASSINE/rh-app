import { prisma, repairPunches } from "@yghr/db";
import { route } from "@/server/api";
import { emit } from "@/server/realtime";

/** Clean the clock-ins: restore real times stamped at sync time, set duplicates and repeats aside, recompute presences. */
export const POST = route({ feature: "devices", rhOnly: true }, async ({ s, log }) => {
  const r = await repairPunches(prisma, s.org.id);
  await log("UPDATE", "PUNCH", null, { repair: r });
  await emit(s.org.id, "attendance:update", {});
  return r;
});
