import { z } from "zod";
import { prisma } from "@yghr/db";
import { route } from "@/server/api";

export const PATCH = route({ allowEmployee: true, body: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().max(30).nullable().optional() }) }, async ({ s, body, log }) => {
  await prisma.user.update({ where: { id: s.userId }, data: body });
  if (s.employeeId) await prisma.employee.update({ where: { id: s.employeeId }, data: { phone: body.phone ?? undefined } });
  await log("UPDATE", "USER", s.userId, body);
  return { ok: true };
});
