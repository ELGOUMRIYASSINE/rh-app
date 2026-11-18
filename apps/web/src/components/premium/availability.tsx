"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { eachDay, monthNameFr, weekday } from "@yghr/core";
import { Button, Card, cn, PageHeader, Skeleton } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface Item { employeeId: string; date: string; available: boolean; note: string | null }
const DAY = ["D", "L", "M", "M", "J", "V", "S"];
const bounds = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` }; };
const shift = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7); };

function MonthNav({ ym, setYm }: { ym: string; setYm: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" onClick={() => setYm(shift(ym, -1))} aria-label="Mois précédent"><ChevronLeft /></Button>
      <span className="min-w-[140px] text-center font-display font-semibold capitalize">{monthNameFr(Number(ym.slice(5)))} {ym.slice(0, 4)}</span>
      <Button size="icon" variant="ghost" onClick={() => setYm(shift(ym, 1))} aria-label="Mois suivant"><ChevronRight /></Button>
    </div>
  );
}

/** Employee: tap a day to cycle Disponible → Indisponible → (non renseigné). */
export function MyAvailability({ employeeId, today }: { employeeId: string; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const { from, to } = bounds(ym);
  const q = useQuery({ queryKey: ["avail", from], queryFn: () => api<{ items: Item[] }>(`/api/availability?from=${from}&to=${to}`) });
  const map = new Map((q.data?.items ?? []).filter((i) => i.employeeId === employeeId).map((i) => [i.date, i.available]));
  async function cycle(d: string) {
    const cur = map.get(d);
    const next = cur === undefined ? false : cur === false ? true : null;
    await api("/api/availability", { method: "PUT", body: { dates: [d], available: next } });
    void q.refetch();
  }
  const days = eachDay(from, to);
  const pad = (weekday(from) + 6) % 7;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Mes disponibilités" subtitle="Indiquez les jours où vous n'êtes pas disponible : votre responsable le verra en planifiant." />
      <Card className="p-4">
        <div className="mb-3 flex justify-center"><MonthNav ym={ym} setYm={setYm} /></div>
        {!q.data ? <Skeleton className="h-72" /> : (
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} className="pb-1 text-[11px] font-semibold text-muted">{d}</div>)}
            {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
            {days.map((d) => {
              const v = map.get(d);
              return (
                <button key={d} disabled={d < today} onClick={() => cycle(d)} className={cn("aspect-square cursor-pointer rounded-[12px] border text-sm font-medium transition disabled:cursor-default disabled:opacity-40", v === false ? "border-danger/40 bg-danger-100 text-danger" : v === true ? "border-success/40 bg-success-100 text-success" : "border-border hover:bg-surface-2", d === today && "ring-2 ring-brand-500")} aria-label={`${d} : ${v === false ? "indisponible" : v === true ? "disponible" : "non renseigné"}`}>
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-danger-100 ring-1 ring-danger/40" />Indisponible</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-success-100 ring-1 ring-success/40" />Disponible</span>
          <span>Touchez un jour pour changer</span>
        </div>
      </Card>
    </div>
  );
}

/** RH: month grid of declared (un)availabilities. */
export function AvailabilityGrid({ employees, today }: { employees: { id: string; name: string }[]; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const { from, to } = bounds(ym);
  const q = useQuery({ queryKey: ["avail-all", from], queryFn: () => api<{ items: Item[] }>(`/api/availability?from=${from}&to=${to}`) });
  const map = new Map((q.data?.items ?? []).map((i) => [`${i.employeeId}|${i.date}`, i.available]));
  const days = eachDay(from, to);
  async function toggle(e: string, d: string) {
    const cur = map.get(`${e}|${d}`);
    await api("/api/availability", { method: "PUT", body: { employeeId: e, dates: [d], available: cur === false ? null : false } });
    toast.success(cur === false ? "Indisponibilité retirée." : "Indisponibilité enregistrée.");
    void q.refetch();
  }
  return (
    <div>
      <PageHeader title="Disponibilités" subtitle="Indisponibilités déclarées par les salariés. Le planning les affiche en arrière-plan et signale tout shift posé dessus." actions={<MonthNav ym={ym} setYm={setYm} />} />
      <Card className="overflow-hidden">
        {!q.data ? <Skeleton className="m-4 h-72" /> : (
          <div className="scrollbar-thin overflow-auto" style={{ maxHeight: "calc(100dvh - 260px)" }}>
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-[200px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left font-semibold text-muted">Salarié</th>
                  {days.map((d) => <th key={d} className={cn("sticky top-0 z-10 min-w-8 border-b border-border bg-surface-2 px-1 py-1.5 font-semibold text-muted", d === today && "bg-brand-100 text-brand-700")}><div>{DAY[weekday(d)]}</div><div className="tabular">{Number(d.slice(8))}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-1.5 text-[13px] font-medium">{e.name}</td>
                    {days.map((d) => {
                      const v = map.get(`${e.id}|${d}`);
                      return <td key={d} onClick={() => toggle(e.id, d)} className={cn("cursor-pointer border-b border-border p-0.5 text-center", weekday(d) % 6 === 0 && "bg-surface-2/60")}><div className={cn("mx-auto h-6 w-6 rounded-[6px]", v === false ? "bg-danger/80" : v === true ? "bg-success/70" : "hover:bg-surface-2")} title={v === false ? "Indisponible" : v === true ? "Disponible" : ""} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarDays className="size-3.5" /> Cliquez sur une case pour ajouter ou retirer une indisponibilité au nom du salarié.</p>
    </div>
  );
}
