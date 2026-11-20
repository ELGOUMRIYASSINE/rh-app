import "server-only";
import { prisma } from "@yghr/db";
import { logoSrc } from "./branding";

const DAY = 86400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Health of one clinic, from cheap aggregate signals. */
function health(c: { status: string; trialEndsAt: Date | null; openTickets: number; urgentTickets: number; errors7d: number; devicesOffline: number; lastActivity: Date | null }) {
  const issues: string[] = [];
  if (c.status === "SUSPENDED") issues.push("Suspendue");
  if (c.status === "TRIAL" && c.trialEndsAt) {
    const left = Math.ceil((c.trialEndsAt.getTime() - Date.now()) / DAY);
    if (left < 0) issues.push("Essai terminé");
    else if (left <= 7) issues.push(`Essai : ${left} j restant${left > 1 ? "s" : ""}`);
  }
  if (c.urgentTickets) issues.push(`${c.urgentTickets} demande${c.urgentTickets > 1 ? "s" : ""} urgente${c.urgentTickets > 1 ? "s" : ""}`);
  else if (c.openTickets) issues.push(`${c.openTickets} demande${c.openTickets > 1 ? "s" : ""} ouverte${c.openTickets > 1 ? "s" : ""}`);
  if (c.errors7d) issues.push(`${c.errors7d} erreur${c.errors7d > 1 ? "s" : ""} (7 j)`);
  if (c.devicesOffline) issues.push(`${c.devicesOffline} pointeuse${c.devicesOffline > 1 ? "s" : ""} hors ligne`);
  if (c.status !== "SUSPENDED" && (!c.lastActivity || Date.now() - c.lastActivity.getTime() > 14 * DAY)) issues.push("Inactive depuis 14 j");
  const level = c.status === "SUSPENDED" || c.urgentTickets || c.errors7d >= 5 ? "danger" : issues.length ? "warning" : "success";
  return { level: level as "danger" | "warning" | "success", issues };
}

export async function clinicsList() {
  const since7 = new Date(Date.now() - 7 * DAY);
  const [orgs, emps, members, tickets, urgent, errors, offline, activity] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: "desc" }, include: { plan: { select: { name: true } } } }),
    prisma.employee.groupBy({ by: ["organizationId"], where: { status: "ACTIVE" }, _count: true }),
    prisma.membership.groupBy({ by: ["organizationId"], where: { active: true, role: { not: "SUPER_ADMIN" } }, _count: true }),
    prisma.supportTicket.groupBy({ by: ["organizationId"], where: { status: { not: "RESOLVED" } }, _count: true }),
    prisma.supportTicket.groupBy({ by: ["organizationId"], where: { status: { not: "RESOLVED" }, priority: "URGENT" }, _count: true }),
    prisma.errorEvent.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since7 }, resolved: false }, _count: true }),
    prisma.device.groupBy({ by: ["organizationId"], where: { status: "OFFLINE" }, _count: true }),
    prisma.auditLog.groupBy({ by: ["organizationId"], _max: { createdAt: true } }),
  ]);
  const m = <T extends { organizationId: string | null }>(rows: T[], f: (r: T) => number) => new Map(rows.map((r) => [r.organizationId, f(r)]));
  const cE = m(emps, (r) => r._count), cM = m(members, (r) => r._count), cT = m(tickets, (r) => r._count), cU = m(urgent, (r) => r._count), cX = m(errors, (r) => r._count), cD = m(offline, (r) => r._count);
  const last = new Map(activity.map((a) => [a.organizationId, a._max.createdAt]));
  return orgs.map((o) => {
    const row = { status: o.status, trialEndsAt: o.trialEndsAt, openTickets: cT.get(o.id) ?? 0, urgentTickets: cU.get(o.id) ?? 0, errors7d: cX.get(o.id) ?? 0, devicesOffline: cD.get(o.id) ?? 0, lastActivity: last.get(o.id) ?? null };
    return {
      id: o.id, name: o.name, slug: o.slug, logo: logoSrc(o.slug, o.logoUrl), plan: o.plan.name, status: o.status, isDemo: o.isDemo, trialEndsAt: iso(o.trialEndsAt), createdAt: iso(o.createdAt)!,
      employees: cE.get(o.id) ?? 0, users: cM.get(o.id) ?? 0, openTickets: row.openTickets, errors7d: row.errors7d, devicesOffline: row.devicesOffline, lastActivity: iso(row.lastActivity),
      health: health(row),
    };
  });
}
export type ClinicRow = Awaited<ReturnType<typeof clinicsList>>[number];

export async function overviewData() {
  const now = Date.now();
  const startToday = new Date(new Date().setHours(0, 0, 0, 0));
  const [clinics, employees, activeUsers, punchesToday, openTickets, errors24h, feed, recentTickets] = await Promise.all([
    clinicsList(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { lastLoginAt: { gte: new Date(now - 7 * DAY) }, isPlatformAdmin: false } }),
    prisma.punch.count({ where: { timestamp: { gte: startToday } } }),
    prisma.supportTicket.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.errorEvent.count({ where: { createdAt: { gte: new Date(now - DAY) } } }),
    activityFeed({ take: 25 }),
    prisma.supportTicket.findMany({ where: { status: { not: "RESOLVED" } }, orderBy: [{ updatedAt: "desc" }], take: 6, include: { organization: { select: { name: true } } } }),
  ]);
  return {
    kpis: {
      clinics: clinics.length,
      active: clinics.filter((c) => c.status === "ACTIVE").length,
      trial: clinics.filter((c) => c.status === "TRIAL").length,
      suspended: clinics.filter((c) => c.status === "SUSPENDED").length,
      employees, activeUsers, punchesToday, openTickets, errors24h,
    },
    watch: clinics.filter((c) => c.health.level !== "success").sort((a, b) => (a.health.level === "danger" ? -1 : 0) - (b.health.level === "danger" ? -1 : 0)).slice(0, 8),
    newest: clinics.slice(0, 5),
    feed,
    tickets: recentTickets.map((t) => ({ id: t.id, subject: t.subject, org: t.organization.name, status: t.status, priority: t.priority, lastFromPlatform: t.lastFromPlatform, updatedAt: iso(t.updatedAt)! })),
  };
}

const ACTION_LABEL: Record<string, string> = { LOGIN: "Connexion", LOGIN_FAILED: "Échec de connexion", LOGOUT: "Déconnexion", CREATE: "Création", UPDATE: "Modification", DELETE: "Suppression", VALIDATE: "Validation", PUBLISH: "Publication", EXPORT: "Export", IMPORT: "Import", APPROVE: "Approbation", REJECT: "Refus", LOCK: "Verrouillage", UNLOCK: "Déverrouillage", CALCULATE: "Calcul", SUSPEND: "Suspension", SUPPORT_ACCESS: "Accès support" };

export async function activityFeed(o: { organizationId?: string; take?: number; action?: string } = {}) {
  const rows = await prisma.auditLog.findMany({
    where: { ...(o.organizationId ? { organizationId: o.organizationId } : {}), ...(o.action ? { action: o.action } : {}) },
    orderBy: { createdAt: "desc" },
    take: o.take ?? 50,
    include: { user: { select: { firstName: true, lastName: true, isPlatformAdmin: true } }, organization: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id, at: r.createdAt.toISOString(), action: r.action, actionLabel: ACTION_LABEL[r.action] ?? r.action, entity: r.entity, org: r.organization ? { id: r.organization.id, name: r.organization.name } : null,
    user: r.user ? `${r.user.firstName} ${r.user.lastName}` : "Système", byPlatform: !!r.user?.isPlatformAdmin, ip: r.ip,
    summary: summarize(r.details),
  }));
}
function summarize(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  const o = d as Record<string, unknown>;
  const v = o.name ?? o.subject ?? o.email ?? o.title ?? o.bulk ?? o.source;
  return v ? String(v).slice(0, 80) : "";
}

export async function clinicDetail(id: string) {
  const o = await prisma.organization.findUnique({ where: { id }, include: { plan: true } });
  if (!o) return null;
  const since30 = new Date(Date.now() - 30 * DAY);
  const [members, employees, services, centres, devices, punches30, leavesPending, payroll, tickets, errors, feed, lastLogin] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: id, role: { in: ["RH", "CHEF", "SUPER_ADMIN"] } }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true, passwordHash: true, lastLoginAt: true, totpEnabled: true, isPlatformAdmin: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.employee.count({ where: { organizationId: id, status: "ACTIVE" } }),
    prisma.service.count({ where: { organizationId: id } }),
    prisma.centre.count({ where: { organizationId: id } }),
    prisma.device.findMany({ where: { organizationId: id }, select: { id: true, name: true, status: true, lastSeenAt: true, mode: true } }),
    prisma.punch.count({ where: { organizationId: id, timestamp: { gte: since30 } } }),
    prisma.leaveRequest.count({ where: { organizationId: id, status: "PENDING" } }),
    prisma.payrollPeriod.findFirst({ where: { organizationId: id }, orderBy: [{ year: "desc" }, { month: "desc" }], select: { year: true, month: true, status: true } }),
    prisma.supportTicket.findMany({ where: { organizationId: id }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.errorEvent.findMany({ where: { organizationId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    activityFeed({ organizationId: id, take: 60 }),
    prisma.membership.findFirst({ where: { organizationId: id, role: { not: "SUPER_ADMIN" }, user: { lastLoginAt: { not: null } } }, orderBy: { user: { lastLoginAt: "desc" } }, select: { user: { select: { lastLoginAt: true } } } }),
  ]);
  return {
    org: {
      id: o.id, name: o.name, slug: o.slug, logo: logoSrc(o.slug, o.logoUrl), plan: o.plan.name, status: o.status, isDemo: o.isDemo, trialEndsAt: iso(o.trialEndsAt), internalNote: o.internalNote ?? "",
      createdAt: iso(o.createdAt)!, contactEmail: o.contactEmail, phone: o.phone, address: o.address, timezone: o.timezone,
    },
    stats: { employees, services, centres, punches30, leavesPending, devices: devices.length, devicesOffline: devices.filter((d) => d.status === "OFFLINE").length, payroll: payroll ? `${String(payroll.month).padStart(2, "0")}/${payroll.year} ${({ DRAFT: "brouillon", CALCULATED: "calculée", VALIDATED: "validée", LOCKED: "clôturée" } as Record<string, string>)[payroll.status] ?? ""}` : null, lastLogin: iso(lastLogin?.user.lastLoginAt) },
    members: members.filter((x) => !x.user.isPlatformAdmin).map((x) => ({ id: x.id, role: x.role, active: x.active, name: `${x.user.firstName} ${x.user.lastName}`, email: x.user.email, activated: !!x.user.passwordHash, lastLoginAt: iso(x.user.lastLoginAt), totp: x.user.totpEnabled })),
    devices: devices.map((d) => ({ ...d, lastSeenAt: iso(d.lastSeenAt) })),
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, updatedAt: iso(t.updatedAt)! })),
    errors: errors.map((e) => ({ id: e.id, at: iso(e.createdAt)!, method: e.method, path: e.path, message: e.message, resolved: e.resolved })),
    feed,
  };
}
export type ClinicDetail = NonNullable<Awaited<ReturnType<typeof clinicDetail>>>;

export async function ticketsList(status?: string) {
  const rows = await prisma.supportTicket.findMany({
    where: status === "open" ? { status: { not: "RESOLVED" } } : status === "resolved" ? { status: "RESOLVED" } : {},
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: { organization: { select: { id: true, name: true } }, createdBy: { select: { firstName: true, lastName: true } }, _count: { select: { messages: true } } },
  });
  return rows.map((t) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, priority: t.priority, lastFromPlatform: t.lastFromPlatform, org: t.organization, author: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : "Compte supprimé", messages: t._count.messages, updatedAt: iso(t.updatedAt)!, createdAt: iso(t.createdAt)! }));
}

export async function ticketThread(id: string, organizationId?: string) {
  const t = await prisma.supportTicket.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    include: { organization: { select: { id: true, name: true, slug: true } }, createdBy: { select: { firstName: true, lastName: true, email: true } }, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true, lastName: true } } } } },
  });
  if (!t) return null;
  return {
    id: t.id, subject: t.subject, category: t.category, status: t.status, priority: t.priority, createdAt: iso(t.createdAt)!, org: t.organization,
    author: t.createdBy ? { name: `${t.createdBy.firstName} ${t.createdBy.lastName}`, email: t.createdBy.email } : null,
    messages: t.messages.map((m) => ({ id: m.id, body: m.body, fromPlatform: m.fromPlatform, at: iso(m.createdAt)!, author: m.author ? `${m.author.firstName} ${m.author.lastName}` : m.fromPlatform ? "Support YGHR" : "Clinique" })),
  };
}
export type TicketThread = NonNullable<Awaited<ReturnType<typeof ticketThread>>>;

export async function errorsList(filter: "open" | "all" = "open") {
  const rows = await prisma.errorEvent.findMany({ where: filter === "open" ? { resolved: false } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { organization: { select: { id: true, name: true } } } });
  return rows.map((e) => ({ id: e.id, at: iso(e.createdAt)!, method: e.method, path: e.path, message: e.message, stack: e.stack, resolved: e.resolved, org: e.organization }));
}
