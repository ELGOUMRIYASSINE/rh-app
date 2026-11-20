"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch, Trash2 } from "lucide-react";
import { addDays, startOfIsoWeek, type Anomaly } from "@yghr/core";
import { Button, Card, CardHeader, cn, Field, Input, Skeleton, td, th } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import { AnomalyCounters, AnomalyList } from "@/components/planning/anomaly-list";
import { confirmDialog } from "@/components/confirm";

interface Ex { id: string; date: string; anomalyType: string | null; justification: string; employee: { firstName: string; lastName: string } | null; approver: { firstName: string; lastName: string } | null }

export function AnomaliesTab({ today }: { today: string }) {
  const qc = useQueryClient();
  const monday = startOfIsoWeek(today);
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(addDays(monday, 6));
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const q = useQuery({
    queryKey: ["anomalies", range],
    enabled: !!range,
    queryFn: () => api<{ anomalies: Anomaly[]; blocking: number; warnings: number }>(`/api/planning/anomalies?from=${range!.from}&to=${range!.to}`),
  });
  const ex = useQuery({ queryKey: ["exceptions", monday], queryFn: () => api<{ items: Ex[] }>(`/api/planning/exceptions?from=${monday}&to=${addDays(monday, 6)}`) });
  async function revoke(id: string) {
    if (!(await confirmDialog({ title: "Révoquer cette exception ?", message: "L'anomalie redeviendra bloquante si sa règle l'est.", danger: true, confirmLabel: "Révoquer" }))) return;
    await api(`/api/planning/exceptions/${id}`, { method: "DELETE" });
    toast.success("Exception révoquée.");
    void qc.invalidateQueries({ queryKey: ["exceptions"] });
    void qc.invalidateQueries({ queryKey: ["anomalies"] });
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Contrôle du planning" subtitle="Contrôle en lecture seule : le planning n'est jamais modifié automatiquement. Corrigez-le dans le Planning ou autorisez une exception justifiée." />
        <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Field label="Du" htmlFor="af"><Input id="af" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /></Field>
          <Field label="Au" htmlFor="at"><Input id="at" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></Field>
          <Button onClick={() => setRange({ from, to })} loading={q.isFetching}><ScanSearch /> Analyser</Button>
          <span className="pb-2.5 text-xs text-muted">3 mois maximum</span>
          {q.data && <div className="ml-auto pb-1.5"><AnomalyCounters blocking={q.data.blocking} warnings={q.data.warnings} /></div>}
        </div>
        {range && (
          <div className="border-t border-border">
            {q.isLoading ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : q.data && <AnomalyList anomalies={q.data.anomalies} onChanged={() => { void q.refetch(); void ex.refetch(); }} />}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Exceptions enregistrées" subtitle="Exceptions de la semaine en cours" />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr>{["Date", "Règle", "Salarié", "Justification", "Approuvée par", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {(ex.data?.items ?? []).map((e) => (
                <tr key={e.id}>
                  <td className={cn(td, "whitespace-nowrap")}>{frDate(e.date)}</td>
                  <td className={cn(td, "font-mono text-xs")}>{e.anomalyType ?? ""}</td>
                  <td className={td}>{e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : ""}</td>
                  <td className={cn(td, "max-w-sm text-[13px]")}>{e.justification}</td>
                  <td className={td}>{e.approver ? `${e.approver.firstName} ${e.approver.lastName}` : ""}</td>
                  <td className={cn(td, "text-right")}><Button size="sm" variant="danger-ghost" onClick={() => revoke(e.id)}><Trash2 /> Révoquer</Button></td>
                </tr>
              ))}
              {ex.data && ex.data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">Aucune exception cette semaine.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
