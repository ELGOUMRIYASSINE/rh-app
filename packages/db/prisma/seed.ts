import { config } from "dotenv";
import path from "node:path";
import argon2 from "argon2";
import { applyOrgDefaults } from "./org-defaults";
import { DEFAULT_FISCAL_RULES_MA, moroccanHolidays, PLAN_SEEDS, startOfIsoWeek } from "@yghr/core";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { createPrismaClient, dbDate, todayIn, seedDemoData } = await import("../src/index");
const db = createPrismaClient();
const TZ = "Africa/Casablanca";
const SLUG = "clinique-demo";
const PASSWORD = process.env.SEED_PASSWORD ?? "Demo2026!yghr";
const DEMO = process.env.SEED_DEMO === "1";


async function main() {
  console.log("→ Plans");
  const plans: Record<string, string> = {};
  for (const p of PLAN_SEEDS) {
    const plan = await db.plan.upsert({ where: { name: p.name }, create: { name: p.name, features: p.features }, update: { features: p.features } });
    plans[p.name] = plan.id;
  }

  console.log("→ Règles fiscales (MA)");
  if (!(await db.fiscalRuleVersion.findFirst({ where: { country: "MA" } }))) {
    await db.fiscalRuleVersion.create({ data: { country: "MA", label: "LF 2025 (inchangée en 2026), à vérifier avec votre comptable", validFrom: dbDate("2025-01-01"), data: DEFAULT_FISCAL_RULES_MA as object } });
  }

  console.log("→ Jours fériés");
  const year = Number(todayIn(TZ).slice(0, 4));
  await db.publicHoliday.deleteMany({ where: { organizationId: null } });
  await db.publicHoliday.createMany({ data: [...moroccanHolidays(year), ...moroccanHolidays(year + 1)].map((h) => ({ date: dbDate(h.date), name: h.name })) });

  if (process.env.SEED_DEMO_ORG === "0") {
    console.log("\n✅ Données de référence prêtes (plans, règles fiscales, jours fériés). Créez votre organisation avec : pnpm org:create");
    return;
  }
  console.log("→ Compte console YGHR (démo)");
  await db.user.upsert({
    where: { email: "admin@demo.yghr.ma" },
    create: { email: "admin@demo.yghr.ma", passwordHash: await argon2.hash(PASSWORD), firstName: "Équipe", lastName: "YGHR", isPlatformAdmin: true },
    update: { isPlatformAdmin: true },
  });
  console.log("→ Organisation de démonstration");
  if ((await db.organization.findUnique({ where: { slug: SLUG } })) && process.env.SEED_RESET !== "1") {
    console.log(`   « ${SLUG} » existe déjà : conservée (SEED_RESET=1 pour la recréer).`);
    return;
  }
  await db.organization.deleteMany({ where: { slug: SLUG } });
  const org = await db.organization.create({
    data: { slug: SLUG, name: "Clinique Démo YGHR", contactEmail: "contact@demo.yghr.ma", accountingEmail: "compta@demo.yghr.ma", timezone: TZ, currency: "MAD", nightStart: "21:00", nightEnd: "06:00", weeklyRestDay: 0, planId: plans["Entreprise"]! },
  });
  const O = org.id;
  const passwordHash = await argon2.hash(PASSWORD);

  const rhUser = await db.user.upsert({
    where: { email: "rh@demo.yghr.ma" },
    create: { email: "rh@demo.yghr.ma", passwordHash, firstName: "Nadia", lastName: "Benali", phone: "06 61 00 00 01" },
    update: { passwordHash, totpEnabled: false, totpSecret: null },
  });
  await db.membership.create({ data: { userId: rhUser.id, organizationId: O, role: "RH" } });

  const { cat, svc, st } = await applyOrgDefaults(db, O, rhUser.id);
  await db.centre.create({ data: { organizationId: O, name: "Centre principal, Casablanca", address: "Bd Zerktouni, Casablanca" } });

  await db.coverageRule.createMany({
    data: [
      { organizationId: O, shiftTypeId: st.M!, serviceId: svc.Urgences!, staffCategoryId: cat.INF!, min: 2, max: 4, days: [], severity: "BLOCKING", label: "Minimum 2 infirmières le matin" },
      { organizationId: O, shiftTypeId: st.N!, serviceId: svc.Urgences!, staffCategoryId: cat.INF!, min: 1, max: 2, days: [], severity: "BLOCKING", label: "Une infirmière de nuit" },
    ],
  });

  const today = todayIn(TZ);
  const rotation = await db.rotation.create({ data: { organizationId: O, name: "Cycle 3×8 Pédiatrie", unit: "WEEK", sequence: [st.M!, st.AM!, st.N!, "REST"], workDays: [1, 2, 3, 4, 5] } });
  await db.rotationAssignment.create({ data: { rotationId: rotation.id, serviceId: svc["Pédiatrie"]!, startDate: dbDate(startOfIsoWeek(today)) } });


  await db.auditLog.create({ data: { organizationId: O, userId: rhUser.id, action: "CREATE", entity: "ORGANIZATION", entityId: O, details: { name: org.name, source: "seed" } } });

  if (DEMO) {
    console.log("→ Données de démonstration (SEED_DEMO=1)");
    await seedDemoData(db, O, rhUser.id, { slug: SLUG, timeZone: TZ, refs: { cat, svc, st }, logins: { passwordHash } });
  }

  console.log("\n✅ Seed terminé");
  console.log("   URL       : http://localhost:3000/login");
  console.log("   Console   : admin@demo.yghr.ma  →  /admin");
  console.log("   RH        : rh@demo.yghr.ma");
  if (DEMO) {
    console.log("   Chef      : chef@demo.yghr.ma");
    console.log("   Salarié   : salarie@demo.yghr.ma");
  }
  console.log(`   Mot de passe : ${PASSWORD}`);
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
