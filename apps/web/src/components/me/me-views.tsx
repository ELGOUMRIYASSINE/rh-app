"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarCheck2, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Download, FileText, LogIn, Moon, Plus, Wallet, Ban } from "lucide-react";
import { addDays, eachDay, formatLongDateFr, isoWeek, LEAVE_TYPE_LABELS, monthNameFr, startOfIsoWeek, weekday, type LeaveType } from "@yghr/core";
import { Button, buttonVariants, Card, CardHeader, cn, EmptyState, readableText, Segmented, Skeleton, StatusPill } from "@yghr/ui";
import { toast } from "sonner";
import type { MyOverview } from "@/server/me";
import { api, download } from "@/lib/api";
import { dayLabel, dh, frDate, hm, timeIn } from "@/lib/format";
import { NewLeaveModal } from "@/components/leaves/new-leave-modal";
import { confirmDialog } from "@/components/confirm";
import { useRealtimeEvent } from "@/components/shell/realtime";

const DAY = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

function ShiftChip({ code, color }: { code: string; color: string }) {
  return <span className="rounded-md px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: color, color: readableText(color) }}>{code}</span>;
}

export function MyHome({ data, base, firstName }: { data: MyOverview; base: string; firstName: string }) {
  const next = data.shifts[0];
  const st = data.status;
  const working = st && (st.status === "PRESENT" || st.status === "LATE");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="relative overflow-hidden rounded-[18px] bg-brand-900 p-6 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-500/30 blur-3xl" />
        <p className="text-sm text-white/60">{formatLongDateFr(data.today)}</p>
        <h1 className="mt-1 font-display text-[28px] font-bold">Bonjour {firstName} 👋</h1>
        <p className="mt-2 text-[15px] text-white/80">
          {working ? <>Vous êtes pointé(e) depuis <b>{timeIn(st!.openSince, data.timezone)}</b>{st!.lateMinutes ? ` (retard de ${st!.lateMinutes} min)` : ""}.</> : st?.status === "LEAVE" ? "Vous êtes en congé aujourd'hui. Bon repos !" : next && next.date === data.today ? <>Votre shift commence à <b>{next.start}</b>.</> : "Pas de shift prévu aujourd'hui."}
        </p>
      </section>

      <Card>
        <CardHeader icon={<CalendarDays />} title="Prochain shift" actions={<Link href={`${base}/planning`} className="text-sm font-medium text-brand-500 hover:underline">Mon planning</Link>} />
        {next ? (
          <div className="flex items-center gap-4 px-5 pb-5">
            <div className="grid size-16 place-items-center rounded-[14px] text-center" style={{ background: next.color, color: readableText(next.color) }}>
              <div><div className="text-[11px] font-semibold uppercase">{DAY[weekday(next.date)]}</div><div className="font-display text-2xl font-bold leading-none">{Number(next.date.slice(8))}</div></div>
            </div>
            <div>
              <div className="font-display text-lg font-semibold">{next.name}</div>
              <div className="font-mono text-sm text-muted">{next.start} – {next.end}{next.end <= next.start ? " (lendemain)" : ""}</div>
              {data.shifts.length > 1 && <div className="mt-1 text-xs text-muted">Puis : {data.shifts.slice(1, 4).map((x) => `${dayLabel(x.date)} ${x.code}`).join(" · ")}</div>}
            </div>
          </div>
        ) : <p className="px-5 pb-5 text-sm text-muted">Aucun shift publié dans les 30 prochains jours.</p>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader icon={<CalendarCheck2 />} title="Mes congés" actions={<Link href={`${base}/conges?new=1`} className={buttonVariants({ size: "sm" })}><Plus /> Demander</Link>} />
          <div className="space-y-2 px-5 pb-5">
            {data.balances.map((b) => (
              <div key={b.type} className="flex items-baseline justify-between">
                <span className="text-sm">{LEAVE_TYPE_LABELS[b.type]}</span>
                <span className="font-display text-xl font-bold tabular">{b.available} <span className="text-sm font-medium text-muted">j</span></span>
              </div>
            ))}
            {data.pendingLeaves > 0 && <p className="text-xs text-muted">{data.pendingLeaves} demande(s) en attente de réponse.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader icon={<Wallet />} title="Dernier bulletin" />
          <div className="px-5 pb-5">
            {data.payslip ? (
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm capitalize text-muted">{monthNameFr(data.payslip.month)} {data.payslip.year}</div><div className="font-display text-xl font-bold tabular">{dh(data.payslip.net)}</div></div>
                <Button size="sm" variant="secondary" onClick={() => download(`/api/payroll/payslips/${data.payslip!.id}/pdf`, "bulletin.pdf")}><Download /> PDF</Button>
              </div>
            ) : <p className="text-sm text-muted">Aucun bulletin disponible pour l'instant.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={<Bell />} title="Dernières notifications" />
        <ul className="divide-y divide-border">
          {data.notifications.map((n) => (
            <li key={n.id} className="flex gap-3 px-5 py-3">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-border" : "bg-brand-500")} />
              <div><div className="text-sm font-medium">{n.title}</div><div className="text-xs text-muted">{n.body}</div></div>
            </li>
          ))}
          {!data.notifications.length && <li className="px-5 py-6 text-center text-sm text-muted">Rien de nouveau.</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={<AlarmClock />} title="Absences et retards" subtitle="30 derniers jours" />
        <ul className="divide-y divide-border">
          {data.history.map((h) => (
            <li key={h.date} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span>{dayLabel(h.date)}</span>
              {h.status === "ABSENT" ? <StatusPill tone={h.justified ? "info" : "danger"}>{h.justified ? "Absence justifiée" : "Absence"}</StatusPill> : <StatusPill tone="warning">Retard {h.late} min</StatusPill>}
            </li>
          ))}
          {!data.history.length && <li className="px-5 py-6 text-center text-sm text-muted">Aucune absence ni retard. Bravo ! 👏</li>}
        </ul>
      </Card>
    </div>
  );
}

export function MyPlanning({ today }: { today: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(startOfIsoWeek(today));
  const from = view === "week" ? startOfIsoWeek(anchor) : `${anchor.slice(0, 7)}-01`;
  const to = view === "week" ? addDays(from, 6) : (() => { const [y, m] = anchor.split("-").map(Number) as [number, number]; return `${anchor.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; })();
  const q = useQuery({ queryKey: ["my-planning", from, to], queryFn: () => api<{ shifts: { id: string; date: string; name: string; code: string; color: string; start: string; end: string; night: boolean }[]; leaves: { startDate: string; endDate: string; type: LeaveType }[] }>(`/api/me/planning?from=${from}&to=${to}`), placeholderData: (p) => p });
  useRealtimeEvent("planning:published", () => q.refetch());
  const nav = (d: number) => setAnchor(view === "week" ? addDays(from, d * 7) : (() => { const [y, m] = anchor.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 10); })());
  const totalMin = (q.data?.shifts ?? []).reduce((t, s) => { const [sh, sm] = s.start.split(":").map(Number) as [number, number]; const [eh, em] = s.end.split(":").map(Number) as [number, number]; let d = eh * 60 + em - (sh * 60 + sm); if (d <= 0) d += 1440; return t + d; }, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold">Mon planning</h1>
        <Button variant="secondary" size="sm" onClick={() => download("/api/me/planning.ics", "mon-planning.ics")}><CalendarPlus /> Ajouter à mon agenda (.ics)</Button>
      </div>
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button size="icon" variant="ghost" onClick={() => nav(-1)} aria-label="Précédent"><ChevronLeft /></Button>
        <span className="min-w-[150px] text-center font-display font-semibold">{view === "week" ? `Semaine ${isoWeek(from).week}` : `${monthNameFr(Number(from.slice(5, 7)))} ${from.slice(0, 4)}`.replace(/^./, (c) => c.toUpperCase())}</span>
        <Button size="icon" variant="ghost" onClick={() => nav(1)} aria-label="Suivant"><ChevronRight /></Button>
        <Segmented size="sm" className="ml-auto" value={view} onChange={setView} options={[{ value: "week", label: "Semaine" }, { value: "month", label: "Mois" }]} />
      </Card>
      {!q.data ? <Skeleton className="h-64" /> : (
        <Card>
          <ul className="divide-y divide-border">
            {eachDay(from, to).map((d) => {
              const shift = q.data.shifts.find((s) => s.date === d);
              const leave = q.data.leaves.find((l) => l.startDate <= d && l.endDate >= d);
              if (view === "month" && !shift && !leave) return null;
              return (
                <li key={d} className={cn("flex items-center gap-4 px-5 py-3", d === today && "bg-brand-100/40")}>
                  <div className="w-14 text-center"><div className="text-[11px] font-semibold uppercase text-muted">{DAY[weekday(d)]}</div><div className={cn("font-display text-xl font-bold", d === today && "text-brand-500")}>{Number(d.slice(8))}</div></div>
                  {leave ? <StatusPill tone="info">{LEAVE_TYPE_LABELS[leave.type]}</StatusPill> : shift ? (
                    <div className="flex items-center gap-3"><ShiftChip code={shift.code} color={shift.color} /><div><div className="text-sm font-medium">{shift.name} {shift.night && <Moon className="inline size-3.5 text-muted" />}</div><div className="font-mono text-xs text-muted">{shift.start} – {shift.end}</div></div></div>
                  ) : <span className="text-sm text-muted">Repos</span>}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-5 py-3 text-sm text-muted">Total planifié (amplitude) : <b className="font-mono text-text">{hm(totalMin)}</b></div>
        </Card>
      )}
    </div>
  );
}

interface MyLeave { id: string; type: LeaveType; label: string; startDate: string; endDate: string; days: number; status: string; decisionNote: string | null }
const LS: Record<string, [string, "warning" | "success" | "danger" | "neutral"]> = { PENDING: ["En attente", "warning"], APPROVED: ["Approuvé", "success"], REJECTED: ["Refusé", "danger"], CANCELLED: ["Annulé", "neutral"] };

export function MyLeaves({ data, employeeId, today, openNew }: { data: MyOverview; employeeId: string; today: string; openNew?: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(!!openNew);
  const q = useQuery({ queryKey: ["my-leaves"], queryFn: () => api<{ items: MyLeave[] }>("/api/leaves?status=ALL") });
  useRealtimeEvent("leave:updated", () => q.refetch());
  async function cancel(l: MyLeave) {
    if (!(await confirmDialog({ title: "Annuler cette demande ?", confirmLabel: "Annuler la demande", danger: true }))) return;
    await api(`/api/leaves/${l.id}`, { method: "PATCH", body: { action: "cancel" } });
    toast.success("Demande annulée.");
    void q.refetch();
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between"><h1 className="font-display text-[26px] font-bold">Mes congés</h1><Button onClick={() => setAdding(true)}><Plus /> Nouvelle demande</Button></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {data.balances.map((b) => (
          <Card key={b.type} className="p-4">
            <div className="text-sm text-muted">{LEAVE_TYPE_LABELS[b.type]}</div>
            <div className="mt-1 font-display text-3xl font-bold tabular">{b.available} <span className="text-base text-muted">j</span></div>
            <div className="mt-1 text-xs text-muted">acquis {b.acquired} · pris {b.taken}{b.pending ? ` · en attente ${b.pending}` : ""}</div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Mes demandes" />
        {!q.data ? <Skeleton className="m-5 h-24" /> : !q.data.items.length ? <EmptyState compact icon={<CalendarCheck2 />} title="Aucune demande">Faites votre première demande : votre responsable sera notifié.</EmptyState> : (
          <ul className="divide-y divide-border">
            {q.data.items.map((l) => {
              const [sl, st] = LS[l.status]!;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{l.label}</div><div className="text-xs text-muted">Du {frDate(l.startDate)} au {frDate(l.endDate)} · {l.days} j</div>{l.decisionNote && <div className="mt-0.5 text-xs text-muted">« {l.decisionNote} »</div>}</div>
                  <StatusPill tone={st}>{sl}</StatusPill>
                  {(l.status === "PENDING" || (l.status === "APPROVED" && l.startDate > today)) && <Button size="sm" variant="ghost" onClick={() => cancel(l)}><Ban /> Annuler</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {adding && <NewLeaveModal employees={[]} selfEmployeeId={employeeId} today={today} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void q.refetch(); void qc.invalidateQueries(); }} />}
    </div>
  );
}

export function MyDocuments({ payslips, documents }: { payslips: { id: string; month: number; year: number; net: number }[]; documents: { id: string; title: string; category: string; createdAt: string; fileUrl: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-[26px] font-bold">Mes documents</h1>
      <Card>
        <CardHeader icon={<Wallet />} title="Bulletins de paie" />
        {payslips.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Vos bulletins apparaîtront ici dès que la paie du mois sera clôturée.</p> : (
          <ul className="divide-y divide-border">
            {payslips.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="size-5 text-brand-500" strokeWidth={1.75} />
                <div className="flex-1"><div className="text-sm font-medium capitalize">{monthNameFr(p.month)} {p.year}</div><div className="text-xs text-muted">Net {dh(p.net)}</div></div>
                <Button size="sm" variant="secondary" onClick={() => download(`/api/payroll/payslips/${p.id}/pdf`, "bulletin.pdf")}><Download /> PDF</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader icon={<FileText />} title="Documents RH" />
        {documents.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Aucun document pour le moment.</p> : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="size-5 text-muted" strokeWidth={1.75} />
                <div className="flex-1"><div className="text-sm font-medium">{d.title}</div><div className="text-xs text-muted">{d.category} · {frDate(d.createdAt)}</div></div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "secondary" })}>Ouvrir</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

