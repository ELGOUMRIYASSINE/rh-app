import { z } from "zod";
import { prisma, recomputeOrgAttendance, todayIn } from "@yghr/db";
import { addDays } from "@yghr/core";
import { route, zDate } from "@/server/api";

export const POST = route({ feature: "attendance", rhOnly: true, body: z.object({ from: zDate.optional(), to: zDate.optional() }) }, async ({ s, body, log }) => {
  const today = todayIn(s.org.timezone);
  const from = body.from ?? addDays(today, -31);
  const to = body.to ?? today;
  const n = await recomputeOrgAttendance(prisma, s.org.id, from, to);
  await log("UPDATE", "ATTENDANCE", null, { recompute: { from, to, days: n } });
  return { days: n };
});
