/**
 * Give someone access to the platform console (/admin): the app owner and the support team.
 *
 *   pnpm platform:admin --email vous@yghr.ma --first Yassine --last Elgoumri
 *   pnpm platform:admin --email ancien@yghr.ma --revoke
 *
 * Prints a 7-day link to choose a password when the account has none yet.
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const { createPrismaClient } = await import("../src/index");

const { values: a } = parseArgs({ options: { email: { type: "string" }, first: { type: "string" }, last: { type: "string" }, revoke: { type: "boolean", default: false } } });
const fail = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };
if (!a.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) fail("--email requis (ex. --email vous@yghr.ma).");
const email = a.email!.toLowerCase();
const db = createPrismaClient();
try {
  if (a.revoke) {
    const r = await db.user.updateMany({ where: { email }, data: { isPlatformAdmin: false } });
    console.log(r.count ? `✅ ${email} n'a plus accès à la console.` : `Aucun compte ${email}.`);
  } else {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing && (!a.first || !a.last)) fail("Nouveau compte : --first et --last sont requis.");
    const user = await db.user.upsert({ where: { email }, create: { email, firstName: a.first!, lastName: a.last!, isPlatformAdmin: true }, update: { isPlatformAdmin: true } });
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    console.log(`\n✅ ${email} a accès à la console : ${appUrl}/admin`);
    if (!user.passwordHash) {
      const raw = randomBytes(32).toString("base64url");
      await db.authToken.create({ data: { type: "RESET", userId: user.id, organizationId: null, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
      console.log(`   Choisissez le mot de passe (lien valable 7 jours) :\n\n   ${appUrl}/reset/${raw}\n`);
    } else console.log("   Connectez-vous avec le mot de passe habituel de ce compte.\n");
  }
} finally {
  await db.$disconnect();
}
