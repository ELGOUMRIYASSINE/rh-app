import { addDays, eachDay, PLAN_SEEDS, RULE_TYPE_META, startOfIsoWeek, weekday, type WorkRuleType } from "@yghr/core";
import type { PrismaClient } from "../generated/prisma/client";
import { dbDate, localDateTimeToUtc, todayIn } from "../tz";
import { recomputeAttendance } from "./attendance";
import { calculatePeriod, fiscalVersionFor } from "./payroll";

/** Ids of the default references, keyed by code (categories), name (services) and code (shift types). */
export type OrgRefs = { cat: Record<string, string>; svc: Record<string, string>; st: Record<string, string> };

async function orgRefs(db: PrismaClient, O: string): Promise<OrgRefs> {
  const [cats, svcs, sts] = await Promise.all([
    db.staffCategory.findMany({ where: { organizationId: O } }),
    db.service.findMany({ where: { organizationId: O } }),
    db.shiftType.findMany({ where: { organizationId: O } }),
  ]);
  return { cat: Object.fromEntries(cats.map((c) => [c.code, c.id])), svc: Object.fromEntries(svcs.map((s) => [s.name, s.id])), st: Object.fromEntries(sts.map((s) => [s.code, s.id])) };
}

/**
 * Starting configuration of a new organisation (section 7.11 seeds): staff categories, services,
 * shift types, work rules and the Moroccan leave policy. Everything stays editable in Paramètres.
 */
export async function applyOrgDefaults(db: PrismaClient, organizationId: string, rhUserId: string) {
  const O = organizationId;
  const cat: Record<string, string> = {};
  for (const [name, code, description] of [
    ["Infirmières", "INF", "Personnel infirmier diplômé d'État"],
    ["Personnel de sécurité", "SEC", "Agents de sécurité et d'accueil"],
    ["Personnel médical", "MED", "Médecins et internes"],
    ["Responsable de service", "RSV", "Cadres de santé et responsables"],
    ["Salariés administratifs", "ADM", "Accueil, RH, comptabilité"],
  ] as const) cat[code] = (await db.staffCategory.create({ data: { organizationId: O, name, code, description } })).id;

  const svc: Record<string, string> = {};
  for (const name of ["Administration & RH", "Bloc opératoire", "Pédiatrie", "Urgences"]) svc[name] = (await db.service.create({ data: { organizationId: O, name } })).id;

  const st: Record<string, string> = {};
  for (const [name, code, s, e, brk, c, color] of [
    ["Garde de 12 heures", "G12", "07:00", "19:00", 60, null, "#14808C"],
    ["Matin", "M", "07:00", "15:00", 30, "INF", "#F2A541"],
    ["Journée", "J", "08:00", "17:00", 60, "ADM", "#1F9D6B"],
    ["Après-midi", "AM", "15:00", "23:00", 30, "INF", "#3B82F6"],
    ["Garde de nuit de 12 heures", "GN12", "19:00", "07:00", 30, null, "#6D4AFF"],
    ["Nuit", "N", "23:00", "07:00", 0, null, "#0F4C55"],
  ] as const) {
    st[code] = (await db.shiftType.create({ data: { organizationId: O, name, code, startTime: s, endTime: e, breakMinutes: brk, breakPaid: false, isNight: code === "GN12" || code === "N", staffCategoryId: c ? cat[c]! : null, color } })).id;
  }

  const rules: [string | null, WorkRuleType, number | null, boolean | null, "BLOCKING" | "WARNING", boolean][] = [
    [null, "MAX_WEEKLY_HOURS", 48, null, "BLOCKING", true],
    [null, "MAX_SHIFT_HOURS", 12, null, "WARNING", true],
    [null, "BREAK_REQUIRED_AFTER_HOURS", 6, null, "WARNING", true],
    [null, "MIN_BREAK_MINUTES", 30, null, "WARNING", true],
    [null, "MIN_REST_BETWEEN_SHIFTS_HOURS", 11, null, "BLOCKING", true],
    ["INF", "MIN_REST_AFTER_NIGHT_HOURS", 24, null, "BLOCKING", true],
    [null, "WEEKLY_REST_DAYS", 1, null, "WARNING", true],
    ["INF", "MAX_CONSECUTIVE_NIGHTS", 3, null, "BLOCKING", true],
    [null, "FORBID_NIGHT_THEN_MORNING", null, true, "BLOCKING", true],
    [null, "OVERTIME_AUTO_DETECT", null, true, "WARNING", true],
    [null, "OVERTIME_WEEKLY_THRESHOLD_HOURS", 44, null, "WARNING", true],
    [null, "DETECT_ABSENCES", null, true, "WARNING", false],
    [null, "LATE_TOLERANCE_MINUTES", 10, null, "WARNING", true],
  ];
  for (const [c, type, value, boolValue, severity, active] of rules) {
    await db.workRule.create({ data: { organizationId: O, staffCategoryId: c ? cat[c]! : null, type, value, boolValue, unit: RULE_TYPE_META[type].unit, severity, exceptionAllowed: true, active, updatedById: rhUserId } });
  }

  await db.leavePolicy.createMany({
    data: [
      { organizationId: O, leaveType: "PAID_LEAVE", enabled: true, countingMethod: "OUVRABLES", accruedPerMonth: 1.5, annualAllowance: 18, annualCap: 18, periodStart: "01-01" },
      { organizationId: O, leaveType: "RTT", enabled: false, countingMethod: "OUVRES", accruedPerMonth: null, annualAllowance: 10, annualCap: 10, periodStart: "01-01" },
      { organizationId: O, leaveType: "REPOS_COMPENSATEUR", enabled: false, countingMethod: "OUVRES", accruedPerMonth: null, annualAllowance: null, annualCap: null, periodStart: "01-01" },
    ],
  });
  return { cat, svc, st } as OrgRefs;
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Create a customer organisation with its first RH administrator and the default settings.
 * Optionally fills it with realistic demo data (25 employees, two weeks of planning, punches, payroll).
 * The caller sends the invitation (no password is ever set here).
 */
export async function createOrganization(
  db: PrismaClient,
  i: { name: string; slug: string; planName: string; timeZone?: string; admin: { email: string; firstName: string; lastName: string }; status?: "ACTIVE" | "TRIAL"; trialEndsAt?: Date | null; demoData?: boolean; createdBy?: string | null; source: string },
) {
  if (!SLUG_RE.test(i.slug)) throw new Error("Identifiant invalide : minuscules, chiffres et tirets uniquement.");
  if (await db.organization.findUnique({ where: { slug: i.slug } })) throw new Error(`L'identifiant « ${i.slug} » est déjà utilisé.`);
  const planSeed = PLAN_SEEDS.find((p) => p.name.toLowerCase() === i.planName.toLowerCase());
  if (!planSeed) throw new Error(`Pack inconnu. Choix : ${PLAN_SEEDS.map((p) => p.name).join(", ")}.`);
  const plan = await db.plan.upsert({ where: { name: planSeed.name }, create: { name: planSeed.name, features: planSeed.features }, update: {} });
  const tz = i.timeZone ?? "Africa/Casablanca";
  const email = i.admin.email.trim().toLowerCase();
  const org = await db.organization.create({
    data: { slug: i.slug, name: i.name, contactEmail: email, timezone: tz, currency: "MAD", weeklyRestDay: 0, planId: plan.id, status: i.status ?? "ACTIVE", isDemo: !!i.demoData, trialEndsAt: i.trialEndsAt ?? null },
  });
  const user = await db.user.upsert({ where: { email }, create: { email, firstName: i.admin.firstName, lastName: i.admin.lastName }, update: {} });
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "RH" } });
  const refs = await applyOrgDefaults(db, org.id, user.id);
  await db.centre.create({ data: { organizationId: org.id, name: "Site principal" } });
  if (i.demoData) await seedDemoData(db, org.id, user.id, { slug: org.slug, timeZone: tz, refs });
  await db.auditLog.create({ data: { organizationId: org.id, userId: i.createdBy ?? user.id, action: "CREATE", entity: "ORGANIZATION", entityId: org.id, details: { name: org.name, source: i.source, plan: plan.name, demo: !!i.demoData } } });
  return { org, user, plan, hasPassword: !!user.passwordHash };
}

/**
 * Remove the operational data of an organisation (employees, planning, punches, leave, payroll, devices…)
 * while keeping its settings, branding and RH accounts. Used to turn a demo clinic into a real one.
 */
export async function clearOrgData(db: PrismaClient, O: string) {
  await db.$transaction([
    db.notification.deleteMany({ where: { organizationId: O } }),
    db.punch.deleteMany({ where: { organizationId: O } }),
    db.deviceUserMap.deleteMany({ where: { organizationId: O } }),
    db.device.deleteMany({ where: { organizationId: O } }),
    db.payElement.deleteMany({ where: { organizationId: O } }),
    db.payrollPeriod.deleteMany({ where: { organizationId: O } }),
    db.advanceRequest.deleteMany({ where: { organizationId: O } }),
    db.leaveRequest.deleteMany({ where: { organizationId: O } }),
    db.shiftAssignment.deleteMany({ where: { organizationId: O } }),
    db.attendanceDay.deleteMany({ where: { organizationId: O } }),
    db.membership.deleteMany({ where: { organizationId: O, role: { in: ["SALARIE", "CHEF"] } } }),
    db.membership.updateMany({ where: { organizationId: O }, data: { employeeId: null } }),
    db.employee.deleteMany({ where: { organizationId: O } }),
    db.organization.update({ where: { id: O }, data: { isDemo: false } }),
  ]);
}

export async function seedDemoData(
  db: PrismaClient,
  O: string,
  rhUserId: string,
  opts: { slug: string; timeZone: string; refs?: OrgRefs; logins?: { passwordHash: string } },
) {
  const TZ = opts.timeZone;
  const SLUG = opts.slug;
  const today = todayIn(TZ);
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
  const { cat, svc, st } = opts.refs ?? (await orgRefs(db, O));
  const centre = (await db.centre.findFirst({ where: { organizationId: O }, orderBy: { createdAt: "asc" } })) ?? (await db.centre.create({ data: { organizationId: O, name: "Site principal" } }));
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
        organizationId: O, centreId: centre.id, matricule: `M${String(i).padStart(4, "0")}`, firstName: first, lastName: last, email, phone: `06 ${String(10 + i)} ${String(20 + i)} ${String(30 + i)} ${String(40 + i)}`,
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
  const youssef = emps[1]!;
  let salUserId: string | null = null;
  if (opts.logins) {
    const passwordHash = opts.logins.passwordHash;
    const chefUser = await db.user.upsert({ where: { email: "chef@demo.yghr.ma" }, create: { email: "chef@demo.yghr.ma", passwordHash, firstName: "Salma", lastName: "Idrissi" }, update: { passwordHash } });
    await db.employee.update({ where: { id: salma.id }, data: { email: "chef@demo.yghr.ma" } });
    await db.membership.create({
      data: { userId: chefUser.id, organizationId: O, role: "CHEF", employeeId: salma.id, permissions: { "planning.manage": true, "leaves.approve": true, "attendance.validate": true, "reports.view": true, "documents.view": true, "messaging.access": true, "team.edit": true } },
    });
    const salUser = await db.user.upsert({ where: { email: "salarie@demo.yghr.ma" }, create: { email: "salarie@demo.yghr.ma", passwordHash, firstName: "Youssef", lastName: "Amrani" }, update: { passwordHash } });
    await db.employee.update({ where: { id: youssef.id }, data: { email: "salarie@demo.yghr.ma" } });
    await db.membership.create({ data: { userId: salUser.id, organizationId: O, role: "SALARIE", employeeId: youssef.id } });
    salUserId = salUser.id;
  }

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
  const device = await db.device.create({ data: { organizationId: O, name: "Pointeuse accueil", mode: "LAN", ip: "192.168.1.201", port: 4370, serialNumber: `DEMO1-${O.slice(-8).toUpperCase()}`, model: "ZKTeco SpeedFace-V5L", firmware: "Ver 6.60", userCount: 26, status: "ONLINE", lastSeenAt: new Date(), lastSyncAt: new Date() } });
  await db.device.create({ data: { organizationId: O, name: "Pointeuse bloc", mode: "ADMS", serialNumber: `DEMO2-${O.slice(-8).toUpperCase()}`, status: "OFFLINE", lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
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
      { organizationId: O, employeeId: youssef.id, type: "FAMILY_EVENT", startDate: dbDate(addDays(monday, 21)), endDate: dbDate(addDays(monday, 22)), days: 2, comment: "Mariage de mon frère", status: "PENDING", createdById: salUserId ?? rhUserId },
    ],
  });

  for (const e of emps) await recomputeAttendance(db, O, e.id, days[0]!, today);

  const [y, m] = today.split("-").map(Number) as [number, number];
  const v = await fiscalVersionFor(db, y, m);
  const period = (await db.payrollPeriod.findUnique({ where: { organizationId_year_month: { organizationId: O, year: y, month: m } } })) ?? await db.payrollPeriod.create({ data: { organizationId: O, year: y, month: m, currency: "MAD", fiscalRuleVersionId: v.id } });
  await db.payElement.create({ data: { organizationId: O, employeeId: youssef.id, periodId: period.id, kind: "TRANSPORT", label: "Indemnité de transport", amount: 300, taxable: false, cnssSubject: false } });
  await db.payElement.create({ data: { organizationId: O, employeeId: emps[2]!.id, periodId: period.id, kind: "PRIME", label: "Prime de garde", amount: 500, taxable: true, cnssSubject: true } });
  await db.advanceRequest.create({ data: { organizationId: O, employeeId: emps[3]!.id, amount: 1000, reason: "Frais de rentrée scolaire", status: "APPROVED", decidedById: rhUserId, decidedAt: new Date() } });
  await db.advanceRequest.create({ data: { organizationId: O, employeeId: emps[4]!.id, amount: 800, reason: "Réparation voiture", status: "PENDING" } });
  await calculatePeriod(db, period.id);

  await db.notification.createMany({
    data: [
      { organizationId: O, userId: rhUserId, type: "leave", title: "Nouvelle demande de congé", body: "Khadija El Fassi demande 6 jours de congés payés.", link: `/${SLUG}/rh/conges` },
      { organizationId: O, userId: rhUserId, type: "device", title: "Pointeuse hors ligne", body: "« Pointeuse bloc » ne répond plus depuis 3 heures.", link: `/${SLUG}/rh/pointeuses` },
    ],
  });
  return { employees: emps.length };
}
