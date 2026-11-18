"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UAParser } from "ua-parser-js";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw, ScrollText, Search } from "lucide-react";
import { Avatar, Button, Card, CardHeader, cn, EmptyState, Input, PageHeader, Select, Skeleton, StatusPill, type Tone } from "@yghr/ui";
import { api, download } from "@/lib/api";
import { frDateTime } from "@/lib/format";
import { JsonDiff } from "@/components/settings/rules/history-tab";

interface Item { id: string; createdAt: string; action: string; entity: string; entityId: string | null; details: Record<string, unknown> | null; ip: string | null; userAgent: string | null; user: { name: string; email: string; role: string | null } | null }
const ACTIONS: Record<string, [string, Tone]> = {
  LOGIN: ["Connexion", "neutral"], LOGIN_FAILED: ["Échec connexion", "danger"], LOGOUT: ["Déconnexion", "neutral"], CREATE: ["Création", "success"], UPDATE: ["Modification", "info"], DELETE: ["Suppression", "danger"],
  VALIDATE: ["Validation", "brand"], PUBLISH: ["Publication", "brand"], EXPORT: ["Export", "accent"], IMPORT: ["Import", "accent"], APPROVE: ["Approbation", "success"], REJECT: ["Refus", "warning"], LOCK: ["Verrouillage", "brand"], UNLOCK: ["Déverrouillage", "warning"], CALCULATE: ["Calcul", "info"],
};
const ROLE: Record<string, string> = { RH: "Responsable RH", CHEF: "Chef d'équipe", SALARIE: "Salarié" };

function device(ua: string | null) {
  if (!ua) return "—";
  const r = new UAParser(ua).getResult();
  return [r.browser.name && `${r.browser.name} ${r.browser.major ?? ""}`.trim(), r.os.name && `${r.os.name} ${r.os.version ?? ""}`.trim()].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

export function AuditView({ tz }: { tz: string }) {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const r = useQuery({ queryKey: ["audit", q, action, page], queryFn: () => api<{ items: Item[]; total: number; page: number; pages: number }>(`/api/audit-logs?${new URLSearchParams({ action, page: String(page), ...(q ? { q } : {}) })}`), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Journal d'Audit" subtitle="Historique des actions et traçabilité" />
      <Card>
        <CardHeader icon={<ScrollText />} title="Historique des événements" subtitle={r.data ? `${r.data.total} événement(s)` : undefined} actions={<Button size="sm" variant="secondary" onClick={() => download(`/api/audit-logs/export?${new URLSearchParams({ action, ...(q ? { q } : {}) })}`, "journal-audit.csv")}><Download /> Export CSV</Button>} />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher par utilisateur, entité…" className="h-9 pl-9" aria-label="Rechercher" />
          </div>
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-9 w-auto" aria-label="Action"><option value="ALL">Toutes les actions</option>{Object.entries(ACTIONS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Button size="icon" variant="secondary" onClick={() => r.refetch()} aria-label="Actualiser"><RefreshCw className={cn(r.isFetching && "animate-spin")} /></Button>
        </div>
        {r.isLoading ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : !r.data?.items.length ? <EmptyState icon={<ScrollText />} title="Aucun événement">Aucune action ne correspond à ces filtres.</EmptyState> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead><tr>{["Horodatage", "Utilisateur", "Action", "Entité & détails", "Empreinte (IP/device)"].map((h) => <th key={h} className="sticky top-0 border-b border-border bg-surface-2 px-4 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
              <tbody>
                {r.data.items.map((i) => {
                  const dt = frDateTime(i.createdAt, tz);
                  const [l, tone] = ACTIONS[i.action] ?? [i.action, "neutral" as Tone];
                  const d = i.details as Record<string, unknown> | null;
                  const hasDiff = d && typeof d === "object" && ("before" in d || "after" in d);
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="border-b border-border px-4 py-3 font-mono text-xs tabular"><div>{dt.date}</div><div className="text-muted">{dt.time}</div></td>
                      <td className="border-b border-border px-4 py-3"><div className="flex items-center gap-2.5"><Avatar name={i.user?.name ?? "Système"} size={28} /><div><div className="text-sm font-medium">{i.user?.name ?? "Système"}</div><div className="text-[11px] text-muted">{i.user?.role ? ROLE[i.user.role] : i.user?.email ?? ""}</div></div></div></td>
                      <td className="border-b border-border px-4 py-3"><StatusPill tone={tone}>{l}</StatusPill></td>
                      <td className="border-b border-border px-4 py-3">
                        <button onClick={() => setOpen(open === i.id ? null : i.id)} className="flex cursor-pointer items-center gap-2 text-left" aria-expanded={open === i.id}>
                          <span className="text-[11px] font-bold tracking-wider">{i.entity}</span>
                          {i.entityId && <span className="max-w-[160px] truncate font-mono text-[11px] text-muted">{i.entityId}</span>}
                          {d && <ChevronDown className={cn("size-3.5 text-muted transition-transform", open === i.id && "rotate-180")} />}
                        </button>
                        {open === i.id && d && <div className="mt-2 max-w-xl">{hasDiff ? <JsonDiff before={(d.before ?? null) as Record<string, unknown> | null} after={(d.after ?? null) as Record<string, unknown> | null} /> : <pre className="scrollbar-thin overflow-x-auto rounded-[10px] bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(d, null, 2)}</pre>}</div>}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-xs"><div className="font-mono">{i.ip ?? "—"}</div><div className="text-muted">{device(i.userAgent)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {r.data && r.data.pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 text-sm">
            <span className="text-muted">Page {r.data.page} / {r.data.pages}</span>
            <Button size="icon-sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Page précédente"><ChevronLeft /></Button>
            <Button size="icon-sm" variant="secondary" disabled={page >= r.data.pages} onClick={() => setPage(page + 1)} aria-label="Page suivante"><ChevronRight /></Button>
          </div>
        )}
      </Card>
    </div>
  );
}
