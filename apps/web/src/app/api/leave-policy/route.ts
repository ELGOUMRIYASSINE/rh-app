import { z } from "zod";
import { prisma } from "@yghr/db";
import { route } from "@/server/api";

const Policy = z.object({
  leaveType: z.enum(["PAID_LEAVE", "RTT", "REPOS_COMPENSATEUR"]),
  enabled: z.boolean(),
  countingMethod: z.enum(["OUVRABLES", "OUVRES"]),
  accruedPerMonth: z.number().min(0).max(31).nullable(),
  annualAllowance: z.number().min(0).max(366).nullable(),
  annualCap: z.number().min(0).max(366).nullable(),
  periodStart: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Format MM-JJ"),
  allowAdvanceFirstYear: z.boolean(),
});

export const GET = route({ feature: "leaves" }, async ({ s }) => ({ items: (await prisma.leavePolicy.findMany({ where: { organizationId: s.org.id } })).map((p) => ({ ...p, accruedPerMonth: p.accruedPerMonth?.toNumber() ?? null, annualAllowance: p.annualAllowance?.toNumber() ?? null, annualCap: p.annualCap?.toNumber() ?? null })) }));

export const PUT = route({ feature: "leaves", rhOnly: true, body: z.object({ policies: z.array(Policy).max(3) }) }, async ({ s, body, log }) => {
  for (const p of body.policies) {
    await prisma.leavePolicy.upsert({ where: { organizationId_leaveType: { organizationId: s.org.id, leaveType: p.leaveType } }, create: { ...p, organizationId: s.org.id }, update: p });
  }
  await log("UPDATE", "LEAVE_POLICY", null, body.policies);
  return { ok: true };
});
