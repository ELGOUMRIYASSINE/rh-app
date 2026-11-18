import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { hashPassword } from "@/server/auth";

/** Set the kiosk PIN ("Code borne") — stored hashed. */
export const PUT = route({ feature: "tablets", rhOnly: true, body: z.object({ pin: z.string().regex(/^\d{4,6}$/, "4 à 6 chiffres").nullable() }) }, async ({ s, params, body, log }) => {
  const e = await prisma.employee.findFirst({ where: { id: params.id, organizationId: s.org.id } });
  if (!e) fail(404, "Salarié introuvable.");
  await prisma.employee.update({ where: { id: e!.id }, data: { kioskPin: body.pin ? await hashPassword(body.pin) : null } });
  await log("UPDATE", "EMPLOYEE", e!.id, { kioskPin: body.pin ? "défini" : "supprimé" });
  return { ok: true };
});
