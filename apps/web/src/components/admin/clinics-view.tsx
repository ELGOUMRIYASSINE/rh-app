"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { Card, EmptyState, Input, PageHeader, Segmented, td, th } from "@yghr/ui";
import type { ClinicRow } from "@/server/platform-data";
import { ClinicAvatar, HealthDot, LinkButton, OrgStatusPill, When } from "./bits";
import { daysUntil } from "./fmt";

export function ClinicsView({ clinics }: { clinics: ClinicRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "ACTIVE" | "TRIAL" | "SUSPENDED" | "watch">("all");
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return clinics.filter((c) => (f === "all" || (f === "watch" ? c.health.level !== "success" : c.status === f)) && (!n || `${c.name} ${c.slug}`.toLowerCase().includes(n)));
  }, [clinics, q, f]);
  const count = (s: string) => clinics.filter((c) => c.status === s).length;
  return (
    <div>
      <PageHeader title="Cliniques" subtitle={`${clinics.length} établissement(s) utilisent YGHR`} actions={<LinkButton href="/admin/cliniques/nouvelle"><Plus /> Nouvelle clinique</LinkButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une clinique…" className="pl-9" aria-label="Rechercher une clinique" />
          </div>
          <Segmented value={f} onChange={setF} options={[
            { value: "all", label: "Toutes", count: clinics.length },
            { value: "ACTIVE", label: "Clientes", count: count("ACTIVE") },
            { value: "TRIAL", label: "Essai / démo", count: count("TRIAL") },
            { value: "SUSPENDED", label: "Suspendues", count: count("SUSPENDED") },
            { value: "watch", label: "À surveiller", count: clinics.filter((c) => c.health.level !== "success").length },
          ]} />
        </div>
        {list.length === 0 ? <EmptyState icon={<Building2 />} title="Aucune clinique">Essayez un autre filtre, ou créez une clinique.</EmptyState> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["", "Clinique", "Statut", "Pack", "Salariés", "Comptes", "Dernière activité", "Signaux"].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((c) => {
                  const left = c.status === "TRIAL" ? daysUntil(c.trialEndsAt) : null;
                  return (
                    <tr key={c.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => router.push(`/admin/cliniques/${c.id}`)}>
                      <td className={`${td} w-8 pr-0`}><HealthDot level={c.health.level} /></td>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <ClinicAvatar name={c.name} logo={c.logo} />
                          <div className="min-w-0"><Link href={`/admin/cliniques/${c.id}`} className="font-medium hover:text-brand-500" onClick={(e) => e.stopPropagation()}>{c.name}</Link><div className="font-mono text-xs text-muted">/{c.slug} · depuis le <When iso={c.createdAt} date /></div></div>
                        </div>
                      </td>
                      <td className={td}><OrgStatusPill status={c.status} isDemo={c.isDemo} />{left !== null && <div className="mt-1 text-xs text-muted">{left >= 0 ? `Fin d'essai dans ${left} j` : "Essai terminé"}</div>}</td>
                      <td className={td}>{c.plan}</td>
                      <td className={`${td} tabular`}>{c.employees}</td>
                      <td className={`${td} tabular`}>{c.users}</td>
                      <td className={`${td} text-[13px] text-muted`}><When iso={c.lastActivity} /></td>
                      <td className={`${td} max-w-[260px] text-xs text-muted`}>{c.health.issues.length ? c.health.issues.join(" · ") : <span className="text-success">RAS</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
