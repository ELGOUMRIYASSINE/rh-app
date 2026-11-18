"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, RefreshCw, Search, UserCheck, UserRoundX, Users } from "lucide-react";
import { addDays, formatLongDateFr } from "@yghr/core";
import type { LiveRow } from "@yghr/db";
import { Avatar, Button, buttonVariants, Card, cn, EmptyState, Input, PageHeader, Segmented, Skeleton, StatTile, StatusPill, td, th } from "@yghr/ui";
import { api } from "@/lib/api";
import { hm, timeIn } from "@/lib/format";
import { useRealtime, useRealtimeEvent } from "@/components/shell/realtime";

const STATUS: Record<string, [string, "success" | "warning" | "danger" | "info" | "neutral"]> = {
  PRESENT: ["Présent", "success"], LATE: ["En retard", "warning"], ABSENT: ["Absent", "danger"], DONE: ["Parti", "neutral"], LEAVE: ["En congé", "info"], OFF: ["Repos", "neutral"],
};

function LiveTimer({ since, base }: { since: string | null; base: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return <span className="font-mono tabular text-muted">{base ? hm(base) : "—"}</span>;
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span className="font-mono tabular text-success">{String(Math.floor(secs / 3600)).padStart(2, "0")}:{String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span>;
}

export function PresenceBoard({ today, tz, gestionHref }: { today: string; tz: string; gestionHref?: string }) {
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<"all" | "employees" | "leads">("all");
  const [tile, setTile] = useState<"all" | "present" | "absent">("all");
  const { connected } = useRealtime();
  const live = useQuery({
    queryKey: ["live", date],
    queryFn: () => api<{ date: string; rows: LiveRow[] }>(`/api/attendance/live?date=${date}`, { silent: true }),
    refetchInterval: date === today ? (connected ? 30_000 : 10_000) : false,
    placeholderData: (p) => p,
  });
  useRealtimeEvent("punch:new", () => live.refetch());
  useRealtimeEvent("attendance:update", () => live.refetch());
  const rows = live.data?.rows ?? [];
  const relevant = rows.filter((r) => r.planned.length || r.firstIn || r.status === "LEAVE");
  const present = relevant.filter((r) => r.status === "PRESENT" || r.status === "LATE");
  const absent = relevant.filter((r) => !(r.status === "PRESENT" || r.status === "LATE") && r.status !== "LEAVE" && r.status !== "OFF");
  const list = useMemo(() => {
    let l = tile === "present" ? present : tile === "absent" ? absent : relevant;
    if (seg === "leads") l = l.filter((r) => r.isLead);
    if (seg === "employees") l = l.filter((r) => !r.isLead);
    if (q) l = l.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(q.toLowerCase()));
    const order = { PRESENT: 0, LATE: 1, ABSENT: 2, DONE: 3, LEAVE: 4, OFF: 5 } as Record<string, number>;
    return [...l].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.lastName.localeCompare(b.lastName));
  }, [relevant, present, absent, tile, seg, q]);
  const updated = live.dataUpdatedAt ? new Date(live.dataUpdatedAt).toLocaleTimeString("fr-FR") : "—";

  return (
    <div>
      <PageHeader title="Présences" subtitle="Qui est présent en ce moment" actions={gestionHref && <Link href={gestionHref} className={buttonVariants({ variant: "secondary" })}><ClipboardCheck /> Corriger les pointages</Link>} />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent"><ChevronLeft /></Button>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-44 pl-9" aria-label="Date" />
        </div>
        <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Jour suivant"><ChevronRight /></Button>
        <span className="font-display text-[15px] font-semibold">{formatLongDateFr(date)}</span>
        {date !== today && <Button size="sm" variant="secondary" onClick={() => setDate(today)}>Aujourd'hui</Button>}
        <div className="relative ml-auto min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom…" className="h-9 pl-9" aria-label="Rechercher un nom" />
        </div>
      </Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <StatTile label="Effectif" value={relevant.length} icon={<Users />} active={tile === "all"} onClick={() => setTile("all")} />
        <StatTile label="Présents" value={present.length} tone="success" icon={<UserCheck />} active={tile === "present"} onClick={() => setTile("present")} />
        <StatTile label="Absents" value={absent.length} tone="danger" icon={<UserRoundX />} active={tile === "absent"} onClick={() => setTile("absent")} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Segmented value={seg} onChange={setSeg} options={[{ value: "all", label: "Tous" }, { value: "employees", label: "Employés" }, { value: "leads", label: "Chefs d'équipe" }]} />
          {date === today && (
            <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted" aria-live="polite">
              <span className="size-2 animate-pulse-dot rounded-full bg-success text-success" /> En direct · mis à jour à {updated}
            </span>
          )}
          <Button size="icon" variant="secondary" onClick={() => live.refetch()} aria-label="Actualiser" className={date === today ? "" : "ml-auto"}><RefreshCw className={cn(live.isFetching && "animate-spin")} /></Button>
        </div>
        {live.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div> : list.length === 0 ? (
          <EmptyState icon={<Users />} title="Personne à afficher">{relevant.length ? "Aucun salarié ne correspond à ce filtre." : "Aucun shift publié ni pointage pour cette date."}</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead><tr>{["Nom", "Fonction", "Statut", "Planifié", "Arrivée", "Dernier pointage", "Temps de présence"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((r) => {
                  const [l, t] = STATUS[r.status] ?? [r.status, "neutral" as const];
                  return (
                    <tr key={r.employeeId} className="hover:bg-surface-2/50">
                      <td className={td}><div className="flex items-center gap-3"><Avatar name={`${r.firstName} ${r.lastName}`} size={32} /><span className="font-medium">{r.firstName} {r.lastName}</span></div></td>
                      <td className={cn(td, "text-[13px]")}>{r.position ?? "—"}<div className="text-xs text-muted">{r.serviceName}</div></td>
                      <td className={td}><StatusPill tone={t} dot>{l}</StatusPill>{r.lateMinutes > 0 && <div className="mt-1 text-xs text-[#9a6a00] dark:text-warning">+{r.lateMinutes} min</div>}</td>
                      <td className={cn(td, "font-mono text-xs")}>{r.planned.map((p) => <div key={p.code + p.start}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.start}–{p.end}</div>)}{!r.planned.length && "—"}</td>
                      <td className={cn(td, "font-mono tabular")}>{timeIn(r.firstIn, tz)}</td>
                      <td className={cn(td, "font-mono tabular")}>{timeIn(r.lastPunch, tz)}</td>
                      <td className={td}>{date === today ? <LiveTimer since={r.openSince} base={r.workedMinutes} /> : <span className="font-mono tabular">{r.workedMinutes ? hm(r.workedMinutes) : "—"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">Présent = entré et pas encore sorti (le statut passe en absent dès que la sortie est pointée). Actualisation automatique toutes les 10 secondes.</p>
      </Card>
    </div>
  );
}
