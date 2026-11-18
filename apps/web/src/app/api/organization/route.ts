import { z } from "zod";
import { prisma } from "@yghr/db";
import { route, zTime } from "@/server/api";

const Body = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  contactEmail: z.string().trim().email("E-mail invalide").or(z.literal("")).nullable(),
  accountingEmail: z.string().trim().email("E-mail invalide").or(z.literal("")).nullable(),
  address: z.string().trim().max(200).nullable(),
  phone: z.string().trim().max(30).nullable(),
  ice: z.string().trim().regex(/^\d{15}$/, "L'ICE comporte 15 chiffres").or(z.literal("")).nullable(),
  cnssEmployerNumber: z.string().trim().regex(/^\d{5,10}$/, "N° d'affiliation CNSS invalide (chiffres uniquement)").or(z.literal("")).nullable(),
  language: z.enum(["fr", "ar", "en"]),
  currency: z.enum(["MAD", "EUR"]),
  timezone: z.string().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat("fr", { timeZone: tz }); return true; } catch { return false; } }, "Fuseau horaire inconnu"),
  nightStart: zTime,
  nightEnd: zTime,
  weeklyRestDay: z.number().int().min(0).max(6).nullable(),
  useServerTimeForPunches: z.boolean(),
  require2FAForAdmins: z.boolean(),
  dailyEmails: z.boolean(),
  persistentSessions: z.boolean(),
}).partial();

export const PATCH = route({ rhOnly: true, body: Body }, async ({ s, body, log }) => {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: s.org.id } });
  const empty = (v: string | null | undefined) => (v === "" ? null : v);
  const data = { ...body, contactEmail: empty(body.contactEmail), accountingEmail: empty(body.accountingEmail), address: empty(body.address), phone: empty(body.phone), ice: empty(body.ice), cnssEmployerNumber: empty(body.cnssEmployerNumber) };
  const org = await prisma.organization.update({ where: { id: s.org.id }, data });
  const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v));
  await log("UPDATE", "ORGANIZATION", s.org.id, changed);
  return { organization: org };
});
