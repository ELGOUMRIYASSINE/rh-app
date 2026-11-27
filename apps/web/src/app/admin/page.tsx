import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Fingerprint, LifeBuoy, Plus, ShieldAlert, Users, UserCheck } from "lucide-react";
import { Card, CardHeader, KpiCard, PageHeader, StatusPill } from "@yghr/ui";
import { overviewData } from "@/server/platform-data";
import { ClinicAvatar, Feed, HealthDot, LinkButton, OrgStatusPill, When } from "@/components/admin/bits";
import { T_PRIORITY, T_STATUS } from "@/components/admin/fmt";

export const metadata: Metadata = { title: "Vue d'ensemble" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const d = await overviewData();
  const k = d.kpis;
  return (
    <div className="space-y-6">
      <PageHeader title="Vue d'ensemble" subtitle="Toutes les cliniques clientes, leur santé et ce qui se passe en ce moment." actions={<LinkButton href="/admin/cliniques/nouvelle"><Plus /> Nouvelle clinique</LinkButton>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Building2 />} value={k.clinics} label="Cliniques" sub={`${k.active} clientes · ${k.trial} en essai · ${k.suspended} suspendue(s)`} href="/admin/cliniques" LinkComponent={Link} />
        <KpiCard icon={<Users />} value={k.employees} label="Salariés gérés" sub={`${k.activeUsers} utilisateurs connectés sur 7 jours`} tone="success" />
        <KpiCard icon={<Fingerprint />} value={k.punchesToday} label="Pointages aujourd'hui" sub="Toutes cliniques confondues" tone="accent" />
        <KpiCard icon={k.errors24h ? <ShieldAlert /> : <LifeBuoy />} value={k.openTickets} label="Demandes de support ouvertes" sub={k.errors24h ? `${k.errors24h} erreur(s) serveur sur 24 h` : "Aucune erreur serveur sur 24 h"} tone={k.errors24h ? "danger" : k.openTickets ? "warning" : "success"} href="/admin/support" LinkComponent={Link} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Cliniques à surveiller" subtitle="Essai bientôt terminé, demandes urgentes, erreurs, pointeuses hors ligne, inactivité." />
          {d.watch.length === 0 ? (
            <div className="flex items-center gap-3 px-5 pb-5 text-sm text-muted"><UserCheck className="size-5 text-success" /> Tout va bien : aucune clinique ne demande d&apos;attention.</div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {d.watch.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/cliniques/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                    <HealthDot level={c.health.level} />
                    <ClinicAvatar name={c.name} logo={c.logo} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="truncate text-xs text-muted">{c.health.issues.join(" · ")}</div>
                    </div>
                    <OrgStatusPill status={c.status} isDemo={c.isDemo} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Dernières demandes de support" actions={<LinkButton href="/admin/support" variant="ghost" size="sm">Tout voir</LinkButton>} />
          {d.tickets.length === 0 ? <div className="px-5 pb-5 text-sm text-muted">Aucune demande ouverte.</div> : (
            <ul className="divide-y divide-border border-t border-border">
              {d.tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.subject}</div>
                      <div className="truncate text-xs text-muted">{t.org} · <When iso={t.updatedAt} />{!t.lastFromPlatform && " · attend votre réponse"}</div>
                    </div>
                    <StatusPill tone={T_PRIORITY[t.priority]![1]}>{T_PRIORITY[t.priority]![0]}</StatusPill>
                    <StatusPill tone={T_STATUS[t.status]![1]}>{T_STATUS[t.status]![0]}</StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Activité en direct" subtitle="Ce que font les utilisateurs dans toutes les cliniques." actions={<LinkButton href="/admin/activite" variant="ghost" size="sm">Tout voir</LinkButton>} />
          <div className="border-t border-border"><Feed items={d.feed} /></div>
        </Card>
        <Card>
          <CardHeader title="Nouvelles cliniques" />
          <ul className="divide-y divide-border border-t border-border">
            {d.newest.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/cliniques/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                  <ClinicAvatar name={c.name} logo={c.logo} size={32} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-muted">Créée le <When iso={c.createdAt} /> · {c.plan}</div></div>
                  <OrgStatusPill status={c.status} isDemo={c.isDemo} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
