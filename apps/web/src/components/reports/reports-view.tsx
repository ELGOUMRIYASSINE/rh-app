"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Moon, Search, Sun, BarChart3 } from "lucide-react";
import { diffDays, monthNameFr } from "@yghr/core";
import { Button, Card, cn, EmptyState, Input, PageHeader, Select, Skeleton, Tooltip } from "@yghr/ui";
import type { ActivityReport } from "@/server/reports";
import { api, download } from "@/lib/api";
import { num } from "@/lib/format";

const CONTRACT: Record<string, string> = { CDI: "CDI", CDD: "CDD", INTERIM: "Intérim", STAGE: "Stage" };
const H = (m: number) => (m ? num(m / 60, 2) : "");
const DH = (n: number | null) => (n ? num(n, 2) : "");

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}
function shiftMonth(ym: string, d: number) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
}

function Th({ children, tip, className }: { children: React.ReactNode; tip?: string; className?: string }) {
  const inner = tip ? <Tooltip content={tip}><span className="cursor-help underline decoration-dotted underline-offset-4">{children}</span></Tooltip> : children;
  return <th className={cn("sticky top-[33px] z-10 whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted", className)}>{inner}</th>;
}

export function ReportsView({ today, canExport }: { today: string; canExport: boolean }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [range, setRange] = useState(monthBounds(today.slice(0, 7)));
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const r = useQuery({ queryKey: ["report", range, role, q], queryFn: () => api<ActivityReport>(`/api/reports/activity?${new URLSearchParams({ from: range.from, to: range.to, role, ...(q ? { q } : {}) })}`), placeholderData: (p) => p });
  const goMonth = (d: number) => { const n = shiftMonth(ym, d); setYm(n); setRange(monthBounds(n)); };
  const days = diffDays(range.to, range.from) + 1;
  const data = r.data;
  const showRates = data?.rows.some((x) => x.hourlyRate !== null || x.monthlyBase !== null) ?? true;
  const gh = "sticky top-0 z-10 border-b border-l border-border bg-brand-100/70 px-3 py-2 text-center text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-400";

  return (
    <div>
      <PageHeader title="Rapports d'activité" subtitle="Synthèse des heures, absences et rémunération par période" />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button size="icon" variant="ghost" onClick={() => goMonth(-1)} aria-label="Mois précédent"><ChevronLeft /></Button>
        <span className="min-w-[130px] text-center font-display text-[15px] font-semibold capitalize">{monthNameFr(Number(ym.slice(5)))} {ym.slice(0, 4)}</span>
        <Button size="icon" variant="ghost" onClick={() => goMonth(1)} aria-label="Mois suivant"><ChevronRight /></Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className="h-9 w-40" aria-label="Du" />
        <span className="text-muted">→</span>
        <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="h-9 w-40" aria-label="Au" />
        <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-[#9b5d0b] dark:text-accent-500">{days} jour{days > 1 ? "s" : ""}</span>
        <div className="relative ml-auto min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="h-9 pl-9" aria-label="Rechercher" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-auto" aria-label="Rôle"><option value="all">Tous</option><option value="employees">Salariés</option><option value="leads">Chefs d'équipe</option></Select>
        {canExport && <Button onClick={() => download(`/api/reports/activity/export?from=${range.from}&to=${range.to}&role=${role}`, "rapport.xlsx")}><Download /> Exporter</Button>}
      </Card>
      <Card className="overflow-hidden">
        {!data ? <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div> : data.rows.length === 0 ? (
          <EmptyState icon={<BarChart3 />} title="Aucun employé actif trouvé.">Modifiez la période ou les filtres.</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-auto" style={{ maxHeight: "calc(100dvh - 280px)" }}>
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className={cn(gh, "left-0 z-30 border-l-0 bg-brand-100 text-left")}>Employés</th>
                  <th className={gh} colSpan={2}>Données contractuelles</th>
                  {showRates && <th className={gh} colSpan={2}>Données salariales</th>}
                  <th className={gh} colSpan={data.weeks.length + 5}>Heures planning période</th>
                  <th className={gh} colSpan={2}>Total absences période</th>
                  <th className={gh} colSpan={3}>Éléments de rémunération</th>
                </tr>
                <tr>
                  <th className="sticky left-0 top-[33px] z-30 min-w-[210px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Nom</th>
                  <Th className="text-left">Type</Th><Th>Durée hebdo</Th>
                  {showRates && <><Th tip="Taux horaire brut (DH)">Taux hor.</Th><Th tip="Salaire de base mensuel brut (DH)">Base mens.</Th></>}
                  <Th tip="Pauses non rémunérées des shifts publiés de la période">Pause</Th>
                  {data.weeks.map((w) => <Th key={w.key} tip={`Heures travaillées (pointages) du ${w.start.split("-").reverse().join("/")} au ${w.end.split("-").reverse().join("/")}`}>{w.label}</Th>)}
                  <Th tip="Total des heures pointées (pauses non rémunérées déduites)">H. Travaillées</Th>
                  <Th tip="Heures travaillées hors plage de nuit"><span className="inline-flex items-center gap-1"><Sun className="size-3" />H. Normales</span></Th>
                  <Th tip="Heures travaillées dans la plage de nuit de l'organisation"><span className="inline-flex items-center gap-1"><Moon className="size-3" />H. Nuit</span></Th>
                  <Th tip="Heures au-delà du seuil hebdomadaire (ou de la durée contractuelle si elle est inférieure)">H. Supp</Th>
                  <Th tip="Journées planifiées sans pointage (absences)">Jours abs.</Th><Th tip="Heures planifiées non travaillées">Heures abs.</Th>
                  <Th>Primes (DH)</Th><Th>Avances (DH)</Th><Th>Transport (DH)</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((x) => (
                  <tr key={x.id} className="hover:bg-surface-2/50">
                    <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-2"><div className="font-medium">{x.name}</div><div className="text-[11px] text-muted">{x.service ?? ""}{x.isLead ? " · chef d'équipe" : ""}</div></td>
                    <td className="border-b border-border px-3 py-2">{x.contractType ? CONTRACT[x.contractType] : ""}</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular">{x.weeklyHours ? `${x.weeklyHours} h` : ""}</td>
                    {showRates && <><td className="border-b border-border px-3 py-2 text-right font-mono tabular">{DH(x.hourlyRate)}</td><td className="border-b border-border px-3 py-2 text-right font-mono tabular">{DH(x.monthlyBase)}</td></>}
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular text-muted">{H(x.breakMinutes)}</td>
                    {x.weeks.map((w, i) => <td key={i} className="border-b border-border px-3 py-2 text-right font-mono tabular">{H(w)}</td>)}
                    <td className="border-b border-border bg-brand-100/25 px-3 py-2 text-right font-mono font-semibold tabular">{H(x.worked)}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{H(x.normal)}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{H(x.night)}</td>
                    <td className={cn("border-b border-border px-3 py-2 text-right font-mono tabular", x.overtime > 0 && "text-[#9a6a00] dark:text-warning")}>{H(x.overtime)}</td>
                    <td className={cn("border-b border-border px-3 py-2 text-right tabular", x.absentDays > 0 && "text-danger")}>{x.absentDays || ""}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{H(x.absentMinutes)}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{DH(x.primes)}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{DH(x.advances)}</td>
                    <td className="border-b border-border px-3 py-2 text-right font-mono tabular">{DH(x.transport)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky bottom-0 left-0 z-20 border-r border-t border-border bg-surface-2 px-3 py-2.5">Total · {data.rows.length} salarié{data.rows.length > 1 ? "s" : ""}</td>
                  <td className="sticky bottom-0 border-t border-border bg-surface-2" colSpan={showRates ? 4 : 2} />
                  <td className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right font-mono tabular">{H(data.totals.breakMinutes)}</td>
                  {data.totals.weeks.map((w, i) => <td key={i} className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right font-mono tabular">{H(w)}</td>)}
                  {[data.totals.worked, data.totals.normal, data.totals.night, data.totals.overtime].map((v, i) => <td key={i} className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right font-mono tabular">{H(v)}</td>)}
                  <td className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right tabular">{data.totals.absentDays}</td>
                  <td className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right font-mono tabular">{H(data.totals.absentMinutes)}</td>
                  {[data.totals.primes, data.totals.advances, data.totals.transport].map((v, i) => <td key={i} className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-2.5 text-right font-mono tabular">{DH(v)}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
