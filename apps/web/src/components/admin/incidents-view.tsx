"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CheckCheck, ChevronDown, ShieldCheck } from "lucide-react";
import { Button, Card, cn, EmptyState, PageHeader, Segmented, StatusPill } from "@yghr/ui";
import { toast } from "sonner";
import { When } from "./bits";
import { api } from "@/lib/api";
import { dateTime } from "./fmt";

interface Err { id: string; at: string; method: string; path: string; message: string; stack: string | null; resolved: boolean; org: { id: string; name: string } | null }

export function IncidentsView({ errors, filter }: { errors: Err[]; filter: "open" | "all" }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const mark = async (id: string, resolved: boolean) => { await api(`/api/admin/errors/${id}`, { method: "PATCH", body: { resolved } }); router.refresh(); };
  return (
    <div>
      <PageHeader title="Incidents" subtitle="Erreurs inattendues du serveur, enregistrées automatiquement : vous les voyez avant que les cliniques ne les signalent." actions={filter === "open" && errors.length > 0 ? <Button variant="secondary" onClick={async () => { await mark("all", true); toast.success("Tous les incidents sont marqués résolus."); }}><CheckCheck /> Tout marquer résolu</Button> : undefined} />
      <Card>
        <div className="p-4"><Segmented value={filter} onChange={(v) => router.push(`/admin/incidents?f=${v}`)} options={[{ value: "open", label: "Non résolus" }, { value: "all", label: "Tous" }]} /></div>
        {errors.length === 0 ? <EmptyState icon={<ShieldCheck />} title="Aucun incident">Le serveur n&apos;a signalé aucune erreur.</EmptyState> : (
          <ul className="divide-y divide-border border-t border-border">
            {errors.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 w-[118px] shrink-0 font-mono text-[11.5px] text-muted"><When iso={e.at} /></span>
                  <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <div className="break-words font-medium">{e.message}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted">{e.method} {e.path}{e.org && <> · <Link href={`/admin/cliniques/${e.org.id}`} className="hover:text-brand-500" onClick={(ev) => ev.stopPropagation()}>{e.org.name}</Link></>}</div>
                  </button>
                  {e.stack && <ChevronDown className={cn("mt-1 size-4 text-muted transition-transform", open === e.id && "rotate-180")} />}
                  {e.resolved ? <StatusPill tone="success">Résolu</StatusPill> : <Button size="sm" variant="ghost" onClick={() => mark(e.id, true)}><Check /> Résolu</Button>}
                </div>
                {open === e.id && e.stack && <pre className="scrollbar-thin mt-2 max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">{e.stack}</pre>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
