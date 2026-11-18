/**
 * Create a real organisation and its first RH administrator.
 *
 *   pnpm org:create --name "Clinique Al Amal" --slug clinique-al-amal \
 *     --email directrice@alamal.ma --first Samira --last Alaoui [--plan Entreprise]
 *
 * Prints a 7-day link for the administrator to choose a password (no password is ever set here).
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PLAN_SEEDS } from "@yghr/core";
import { applyOrgDefaults } from "./org-defaults";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const { createPrismaClient } = await import("../src/index");

const { values: a } = parseArgs({
  options: { name: { type: "string" }, slug: { type: "string" }, email: { type: "string" }, first: { type: "string" }, last: { type: "string" }, plan: { type: "string", default: "Entreprise" }, timezone: { type: "string", default: "Africa/Casablanca" } },
});
const fail = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };
if (!a.name || !a.slug || !a.email || !a.first || !a.last) fail('Arguments requis : --name --slug --email --first --last (voir l\'en-tête du script).');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug!)) fail("Le slug ne doit contenir que des minuscules, chiffres et tirets (ex. clinique-al-amal).");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email!)) fail("E-mail invalide.");

const db = createPrismaClient();
try {
  if (await db.organization.findUnique({ where: { slug: a.slug } })) fail(`L'identifiant « ${a.slug} » est déjà utilisé.`);
  const planSeed = PLAN_SEEDS.find((p) => p.name.toLowerCase() === a.plan!.toLowerCase());
  if (!planSeed) fail(`Pack inconnu. Choix : ${PLAN_SEEDS.map((p) => p.name).join(", ")}.`);
  const plan = await db.plan.upsert({ where: { name: planSeed!.name }, create: { name: planSeed!.name, features: planSeed!.features }, update: {} });

  const email = a.email!.toLowerCase();
  const org = await db.organization.create({ data: { slug: a.slug!, name: a.name!, contactEmail: email, timezone: a.timezone!, currency: "MAD", weeklyRestDay: 0, planId: plan.id } });
  const user = await db.user.upsert({ where: { email }, create: { email, firstName: a.first!, lastName: a.last! }, update: {} });
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "RH" } });
  await applyOrgDefaults(db, org.id, user.id);
  await db.auditLog.create({ data: { organizationId: org.id, userId: user.id, action: "CREATE", entity: "ORGANIZATION", entityId: org.id, details: { name: org.name, source: "org:create" } } });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`\n✅ Organisation « ${org.name} » créée (pack ${plan.name}).`);
  if (user.passwordHash) {
    console.log(`   ${email} a déjà un compte : il se connecte avec son mot de passe habituel sur ${appUrl}/login`);
  } else {
    const raw = randomBytes(32).toString("base64url");
    await db.authToken.create({ data: { type: "INVITE", userId: user.id, organizationId: org.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
    console.log(`   Lien à envoyer à ${email} pour choisir son mot de passe (valable 7 jours) :\n\n   ${appUrl}/invite/${raw}\n`);
  }
} finally {
  await db.$disconnect();
}
