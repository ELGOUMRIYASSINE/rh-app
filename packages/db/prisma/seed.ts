import { config } from "dotenv";
import path from "node:path";
import argon2 from "argon2";
import { applyOrgDefaults } from "./org-defaults";
import {
  addDays,
  DEFAULT_FISCAL_RULES_MA,
  eachDay,
  moroccanHolidays,
  PLAN_SEEDS,
  startOfIsoWeek,
  weekday,
} from "@yghr/core";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { createPrismaClient, dbDate, localDateTimeToUtc, todayIn, recomputeAttendance, calculatePeriod, fiscalVersionFor } = await import("../src/index");
const db = createPrismaClient();
const TZ = "Africa/Casablanca";
const SLUG = "clinique-demo";
const PASSWORD = process.env.SEED_PASSWORD ?? "Demo2026!yghr";
const DEMO = process.env.SEED_DEMO === "1";

// Deterministic PRNG so the demo looks the same on every run.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;

async function main() {
  console.log("→ Plans");
  const plans: Record<string, string> = {};
  for (const p of PLAN_SEEDS) {
    const plan = await db.plan.upsert({ where: { name: p.name }, create: { name: p.name, features: p.features }, update: { features: p.features } });
    plans[p.name] = plan.id;
  }

  console.log("→ Règles fiscales (MA)");
  if (!(await db.fiscalRuleVersion.findFirst({ where: { country: "MA" } }))) {
    await db.fiscalRuleVersion.create({ data: { country: "MA", label: "LF 2025 (inchangée 2026) — à vérifier avec votre comptable", validFrom: dbDate("2025-01-01"), data: DEFAULT_FISCAL_RULES_MA as object } });
  }

  console.log("→ Jours fériés");
  const year = Number(todayIn(TZ).slice(0, 4));
  await db.publicHoliday.deleteMany({ where: { organizationId: null } });
  await db.publicHoliday.createMany({ data: [...moroccanHolidays(year), ...moroccanHolidays(year + 1)].map((h) => ({ date: dbDate(h.date), name: h.name })) });

  if (process.env.SEED_DEMO_ORG === "0") {
    console.log("\n✅ Données de référence prêtes (plans, règles fiscales, jours fériés). Créez votre organisation avec : pnpm org:create");
    return;
  }
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
  await db.centre.create({ data: { organizationId: O, name: "Centre principal — Casablanca", address: "Bd Zerktouni, Casablanca" } });

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

  if (DEMO) await seedDemo(O, rhUser.id, passwordHash, cat, svc, st, today);

  console.log("\n✅ Seed terminé");
  console.log("   URL       : http://localhost:3000/login");
  console.log("   RH        : rh@demo.yghr.ma");
  if (DEMO) {
    console.log("   Chef      : chef@demo.yghr.ma");
    console.log("   Salarié   : salarie@demo.yghr.ma");
  }
  console.log(`   Mot de passe : ${PASSWORD}`);
}

async function seedDemo(O: string, rhUserId: string, passwordHash: string, cat: Record<string, string>, svc: Record<string, string>, st: Record<string, string>, today: string) {
  console.log("→ Données de démonstration (SEED_DEMO=1)");
  const people: [string, string, string, string, string, number][] = [
    // first, last, category, service, position, monthly base
    ["Salma", "Idrissi", "RSV", "Urgences", "Cadre de santé", 15000],
    ["Youssef", "Amrani", "INF", "Urgences", "Infirmier", 9505.2],
    ["Khadija", "El Fassi", "INF", "Urgences", "Infirmière", 8200],
    ["Omar", "Benjelloun", "INF", "Urgences", "Infirmier", 7900],
    ["Imane", "Tazi", "INF", "Urgences", "Infirmière", 8100],
    ["Hamza", "Alaoui", "INF", "Urgences", "Infirmier", 7600],
    ["Sara", "Berrada", "INF", "Pédiatrie", "Infirmière puéricultrice", 8800],
    ["Mehdi", "Chraibi", "INF", "Pédiatrie", "Infirmier", 7800],
    ["Nisrine", "Kettani", "INF", "Pédiatrie", "Infirmière", 7700],
    ["Ayoub", "Lahlou", "INF", "Bloc opératoire", "IBODE", 9800],
    ["Zineb", "Sqalli", "INF", "Bloc opératoire", "Infirmière de bloc", 9300],
    ["Rachid", "Bennani", "MED", "Urgences", "Médecin urgentiste", 28000],
    ["Leila", "Zniber", "MED", "Pédiatrie", "Pédiatre", 30000],
    ["Anas", "Ouazzani", "MED", "Bloc opératoire", "Anesthésiste", 32000],
    ["Hicham", "Filali", "SEC", "Administration & RH", "Agent de sécurité", 4000],
    ["Mustapha", "Naciri", "SEC", "Administration & RH", "Agent de sécurité", 4000],
    ["Fatima Zahra", "Mernissi", "ADM", "Administration & RH", "Chargée RH", 9000],
    ["Kenza", "Belkadi", "ADM", "Administration & RH", "Comptable", 10500],
    ["Adil", "Hajji", "ADM", "Administration & RH", "Agent d'accueil", 4500],
    ["Meryem", "Sefrioui", "ADM", "Administration & RH", "Secrétaire médicale", 5200],
    ["Soufiane", "Rami", "INF", "Urgences", "Aide-soignant", 5600],
    ["Hajar", "Bouzid", "INF", "Pédiatrie", "Aide-soignante", 5400],
    ["Yassine", "Mansouri", "INF", "Bloc opératoire", "Aide-soignant", 5500],
    ["Ghita", "Lamrani", "RSV", "Pédiatrie", "Responsable de service", 14000],
    ["Driss", "Kabbaj", "ADM", "Administration & RH", "Technicien maintenance", 6200],
  ];
  const emps: { id: string; code: string; service: string; first: string }[] = [];
  let i = 0;
  for (const [first, last, c, s, position, base] of people) {
    i++;
    const email = `${first.toLowerCase().replace(/\s+/g, "-")}.${last.toLowerCase().replace(/\s+/g, "-")}@demo.yghr.ma`.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const e = await db.employee.create({
      data: {
        organizationId: O, matricule: `M${String(i).padStart(4, "0")}`, firstName: first, lastName: last, email, phone: `06 ${String(10 + i)} ${String(20 + i)} ${String(30 + i)} ${String(40 + i)}`,
        position, serviceId: svc[s]!, staffCategoryId: cat[c]!, contractType: i % 7 === 0 ? "CDD" : "CDI", contractReason: i % 7 === 0 ? "Remplacement congé maternité" : null,
        weeklyHours: 44, monthlyBase: base, hireDate: dbDate(`${2016 + (i % 9)}-${String((i % 12) + 1).padStart(2, "0")}-01`), birthDate: dbDate(`${1975 + (i % 25)}-0${(i % 9) + 1}-15`),
        cnssNumber: String(120000000 + i * 7919), cin: `BK${String(100000 + i * 37)}`, familyDependents: i === 2 ? 2 : i % 4,
      },
    });
    emps.push({ id: e.id, code: c, service: s, first });
  }
  // Team lead: Salma leads the Urgences nurses.
  const salma = emps[0]!;
  const urgTeam = emps.filter((e) => e.service === "Urgences" && e.code === "INF");
  await db.employee.updateMany({ where: { id: { in: urgTeam.map((e) => e.id) } }, data: { teamLeadId: salma.id } });
  const chefUser = await db.user.upsert({ where: { email: "chef@demo.yghr.ma" }, create: { email: "chef@demo.yghr.ma", passwordHash, firstName: "Salma", lastName: "Idrissi" }, update: { passwordHash } });
  await db.employee.update({ where: { id: salma.id }, data: { email: "chef@demo.yghr.ma" } });
  await db.membership.create({
    data: { userId: chefUser.id, organizationId: O, role: "CHEF", employeeId: salma.id, permissions: { "planning.manage": true, "leaves.approve": true, "attendance.validate": true, "reports.view": true, "documents.view": true, "messaging.access": true, "team.edit": true } },
  });
  const youssef = emps[1]!;
  const salUser = await db.user.upsert({ where: { email: "salarie@demo.yghr.ma" }, create: { email: "salarie@demo.yghr.ma", passwordHash, firstName: "Youssef", lastName: "Amrani" }, update: { passwordHash } });
  await db.employee.update({ where: { id: youssef.id }, data: { email: "salarie@demo.yghr.ma" } });
  await db.membership.create({ data: { userId: salUser.id, organizationId: O, role: "SALARIE", employeeId: youssef.id } });

  // Two weeks of published planning: previous ISO week + current ISO week.
  const monday = startOfIsoWeek(today);
  const days = eachDay(addDays(monday, -7), addDays(monday, 6));
  const urgPattern = ["M", "M", "AM", "N", "M"];
  const assignments: { employeeId: string; date: Date; shiftTypeId: string; status: "PUBLISHED"; source: "MANUAL" | "ROTATION" }[] = [];
  for (const [idx, e] of emps.entries()) {
    for (const [di, date] of days.entries()) {
      const wd = weekday(date);
      let code: string | null = null;
      if (e.code === "ADM" || e.code === "RSV") code = wd >= 1 && wd <= 5 ? "J" : null;
      else if (e.code === "SEC") code = (di + idx) % 2 === 0 ? "G12" : (di + idx) % 4 === 1 ? "GN12" : null;
      else if (e.code === "MED") code = wd >= 1 && wd <= 5 ? "G12" : null;
      else if (e.service === "Urgences") {
        // 5 on / 2 off, staggered so that coverage is mostly met
        const slot = (di + idx) % 7;
        code = slot < 5 ? urgPattern[(slot + idx) % urgPattern.length]! : null;
        if (code === "N" && (di + idx) % 7 === 4) code = null;
      } else if (e.service === "Pédiatrie") code = wd >= 1 && wd <= 5 ? pick(["M", "AM", "M"]) : null;
      else code = wd >= 1 && wd <= 5 ? "J" : null;
      if (code) assignments.push({ employeeId: e.id, date: dbDate(date), shiftTypeId: st[code]!, status: "PUBLISHED", source: "MANUAL" });
    }
  }
  await db.shiftAssignment.createMany({ data: assignments.map((a) => ({ organizationId: O, ...a })) });

  // Device + punches
  const device = await db.device.create({ data: { organizationId: O, name: "Pointeuse accueil", mode: "LAN", ip: "192.168.1.201", port: 4370, serialNumber: "DEMO0001ZK", model: "ZKTeco SpeedFace-V5L", firmware: "Ver 6.60", userCount: 26, status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: new Date() } });
  await db.device.create({ data: { organizationId: O, name: "Pointeuse bloc", mode: "ADMS", serialNumber: "DEMO0002ZK", status: "OFFLINE", lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
  for (const [idx, e] of emps.entries()) await db.deviceUserMap.create({ data: { organizationId: O, deviceId: device.id, deviceUserId: String(100 + idx), employeeId: e.id } });

  const types = await db.shiftType.findMany({ where: { organizationId: O } });
  const tMap = new Map(types.map((t) => [t.id, t]));
  const nowMs = Date.now();
  const punches: { organizationId: string; deviceId: string; deviceUserId: string; employeeId: string; timestamp: Date; source: "DEVICE"; verifyMode: string }[] = [];
  let missingOutDone = false;
  for (const a of assignments) {
    const date = a.date.toISOString().slice(0, 10);
    if (date > today) continue;
    const t = tMap.get(a.shiftTypeId)!;
    const idx = emps.findIndex((e) => e.id === a.employeeId);
    if (rand() < 0.04) continue; // a few absences
    const lateRoll = rand();
    const delay = lateRoll < 0.12 ? 12 + Math.floor(rand() * 25) : -Math.floor(rand() * 12);
    const inAt = new Date(localDateTimeToUtc(date, t.startTime, TZ).getTime() + delay * 60_000);
    let endDate = date;
    if (t.endTime <= t.startTime) endDate = addDays(date, 1);
    const outAt = new Date(localDateTimeToUtc(endDate, t.endTime, TZ).getTime() + Math.floor(rand() * 15) * 60_000);
    const base = { organizationId: O, deviceId: device.id, deviceUserId: String(100 + idx), employeeId: a.employeeId, source: "DEVICE" as const, verifyMode: rand() < 0.8 ? "Empreinte" : "Visage" };
    if (inAt.getTime() < nowMs) punches.push({ ...base, timestamp: inAt });
    const skipOut = !missingOutDone && date < today && t.code === "J";
    if (skipOut) {
      missingOutDone = true;
      continue;
    }
    if (outAt.getTime() < nowMs) punches.push({ ...base, timestamp: outAt });
  }
  // Unknown fingerprint #5
  for (let k = 0; k < 3; k++) punches.push({ organizationId: O, deviceId: device.id, deviceUserId: "5", employeeId: null as unknown as string, timestamp: new Date(nowMs - (k + 1) * 26 * 3600_000), source: "DEVICE", verifyMode: "Empreinte" });
  await db.punch.createMany({ data: punches, skipDuplicates: true });

  // Leave requests
  await db.leaveRequest.createMany({
    data: [
      { organizationId: O, employeeId: emps[2]!.id, type: "PAID_LEAVE", startDate: dbDate(addDays(monday, 14)), endDate: dbDate(addDays(monday, 19)), days: 6, comment: "Vacances en famille à Agadir", status: "PENDING", createdById: rhUserId },
      { organizationId: O, employeeId: emps[7]!.id, type: "SICK_LEAVE", startDate: dbDate(addDays(monday, -3)), endDate: dbDate(addDays(monday, -2)), days: 2, comment: "Certificat médical fourni", status: "APPROVED", createdById: rhUserId, decidedById: rhUserId, decidedAt: new Date() },
      { organizationId: O, employeeId: youssef.id, type: "FAMILY_EVENT", startDate: dbDate(addDays(monday, 21)), endDate: dbDate(addDays(monday, 22)), days: 2, comment: "Mariage de mon frère", status: "PENDING", createdById: salUser.id },
    ],
  });

  console.log("→ Calcul des présences");
  for (const e of emps) await recomputeAttendance(db, O, e.id, days[0]!, today);

  console.log("→ Période de paie");
  const [y, m] = today.split("-").map(Number) as [number, number];
  const v = await fiscalVersionFor(db, y, m);
  const period = await db.payrollPeriod.create({ data: { organizationId: O, year: y, month: m, currency: "MAD", fiscalRuleVersionId: v.id } });
  await db.payElement.create({ data: { organizationId: O, employeeId: youssef.id, periodId: period.id, kind: "TRANSPORT", label: "Indemnité de transport", amount: 300, taxable: false, cnssSubject: false } });
  await db.payElement.create({ data: { organizationId: O, employeeId: emps[2]!.id, periodId: period.id, kind: "PRIME", label: "Prime de garde", amount: 500, taxable: true, cnssSubject: true } });
  await db.advanceRequest.create({ data: { organizationId: O, employeeId: emps[3]!.id, amount: 1000, reason: "Frais de rentrée scolaire", status: "APPROVED", decidedById: rhUserId, decidedAt: new Date() } });
  await db.advanceRequest.create({ data: { organizationId: O, employeeId: emps[4]!.id, amount: 800, reason: "Réparation voiture", status: "PENDING" } });
  await calculatePeriod(db, period.id);

  await db.notification.createMany({
    data: [
      { organizationId: O, userId: rhUserId, type: "leave", title: "Nouvelle demande de congé", body: "Khadija El Fassi demande 6 jours de congés payés.", link: `/${SLUG}/rh/conges` },
      { organizationId: O, userId: rhUserId, type: "device", title: "Pointeuse hors ligne", body: "« Pointeuse bloc » ne répond plus depuis 3 heures.", link: `/${SLUG}/rh/pointeuses` },
      { organizationId: O, userId: salUser.id, type: "planning", title: "Planning publié", body: "Votre planning de la semaine est disponible.", link: `/${SLUG}/salarie/planning` },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
