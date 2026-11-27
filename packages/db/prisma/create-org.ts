/**
 * Create a real organisation and its first RH administrator.
 *
 *   pnpm org:create --name "Clinique Al Amal" --slug clinique-al-amal \
 *     --email directrice@alamal.ma --first Samira --last Alaoui [--plan Entreprise] [--demo]
 *
 * Prints a 7-day link for the administrator to choose a password (no password is ever set here).
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const { createPrismaClient, createOrganization } = await import("../src/index");

const { values: a } = parseArgs({
  options: { name: { type: "string" }, slug: { type: "string" }, email: { type: "string" }, first: { type: "string" }, last: { type: "string" }, plan: { type: "string", default: "Entreprise" }, timezone: { type: "string", default: "Africa/Casablanca" }, demo: { type: "boolean", default: false } },
});
const fail = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };
if (!a.name || !a.slug || !a.email || !a.first || !a.last) fail('Arguments requis : --name --slug --email --first --last (voir l\'en-tête du script).');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug!)) fail("Le slug ne doit contenir que des minuscules, chiffres et tirets (ex. clinique-al-amal).");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email!)) fail("E-mail invalide.");

const db = createPrismaClient();
try {
  const { org, user, plan, hasPassword } = await createOrganization(db, {
    name: a.name!, slug: a.slug!, planName: a.plan!, timeZone: a.timezone!, demoData: !!a.demo,
    admin: { email: a.email!, firstName: a.first!, lastName: a.last! }, source: "org:create",
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`\n✅ Organisation « ${org.name} » créée (pack ${plan.name}${a.demo ? ", avec données de démonstration" : ""}).`);
  if (hasPassword) {
    console.log(`   ${user.email} a déjà un compte : il se connecte avec son mot de passe habituel sur ${appUrl}/login`);
  } else {
    const raw = randomBytes(32).toString("base64url");
    await db.authToken.create({ data: { type: "INVITE", userId: user.id, organizationId: org.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
    console.log(`   Lien à envoyer à ${user.email} pour choisir son mot de passe (valable 7 jours) :\n\n   ${appUrl}/invite/${raw}\n`);
  }
} catch (e) {
  fail((e as Error).message);
} finally {
  await db.$disconnect();
}
