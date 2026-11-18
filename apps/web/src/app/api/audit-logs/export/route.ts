import { prisma } from "@yghr/db";
import { route } from "@/server/api";
import { auditWhere } from "@/server/audit-query";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export const GET = route({ feature: "audit", permission: "audit.view" }, async ({ s, req, log }) => {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const action = req.nextUrl.searchParams.get("action") ?? undefined;
  const items = await prisma.auditLog.findMany({ where: auditWhere(s.org.id, q, action), orderBy: { createdAt: "desc" }, take: 10_000, include: { user: { select: { firstName: true, lastName: true, email: true } } } });
  const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: s.org.timezone });
  const csv = ["Horodatage;Utilisateur;Email;Action;Entité;ID;IP;Navigateur;Détails", ...items.map((i) => [fmt.format(i.createdAt), i.user ? `${i.user.firstName} ${i.user.lastName}` : "Système", i.user?.email, i.action, i.entity, i.entityId, i.ip, i.userAgent, JSON.stringify(i.details ?? {})].map(esc).join(";"))].join("\r\n");
  await log("EXPORT", "AUDIT_LOG", null, { count: items.length });
  return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="journal-audit-${s.org.slug}.csv"` } });
});
