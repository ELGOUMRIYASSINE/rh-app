"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarCheck2, Check, ChevronDown, Paperclip, Plus, Search, Settings2, X } from "lucide-react";
import { LEAVE_TYPE_LABELS, LEAVE_TYPES, type LeaveType } from "@yghr/core";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Field, Input, PageHeader, Select, Skeleton, StatusPill, td, th, Tooltip } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import { useRealtimeEvent } from "@/components/shell/realtime";
import { NewLeaveModal } from "./new-leave-modal";

interface Leave { id: string; employee: { id: string; firstName: string; lastName: string; position: string | null }; type: LeaveType; label: string; startDate: string; endDate: string; halfDayStart: boolean; halfDayEnd: boolean; days: number; comment: string | null; attachmentUrl: string | null; status: string; decisionNote: string | null; decidedBy: { firstName: string; lastName: string } | null; createdAt: string; canDecide: boolean }
interface Policy { leaveType: "PAID_LEAVE" | "RTT" | "REPOS_COMPENSATEUR"; enabled: boolean; countingMethod: "OUVRABLES" | "OUVRES"; accruedPerMonth: number | null; annualAllowance: number | null; annualCap: number | null; periodStart: string; allowAdvanceFirstYear: boolean }
const STATUS: Record<string, [string, "warning" | "success" | "danger" | "neutral"]> = { PENDING: ["En attente", "warning"], APPROVED: ["Approuvé", "success"], REJECTED: ["Refusé", "danger"], CANCELLED: ["Annulé", "neutral"] };

export function LeavesView({ employees, selfEmployeeId, today, openNew, defaultEmployeeId, canEditPolicy }: { employees: { id: string; name: string }[]; selfEmployeeId: string | null; today: string; openNew?: boolean; defaultEmployeeId?: string | null; canEditPolicy: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [adding, setAdding] = useState(!!openNew);
  const list = useQuery({ queryKey: ["leaves", status, type, q, sort], queryFn: () => api<{ items: Leave[]; counts: Record<string, number> }>(`/api/leaves?${new URLSearchParams({ status, sort, ...(type ? { type } : {}), ...(q ? { q } : {}) })}`), placeholderData: (p) => p });
  useRealtimeEvent("leave:updated", () => qc.invalidateQueries({ queryKey: ["leaves"] }));
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((t, n) => t + n, 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["leaves"] });

  async function decide(l: Leave, action: "approve" | "reject" | "cancel") {
    let note: string | undefined;
    if (action === "reject") {
      const r = await confirmDialog({ title: `Refuser la demande de ${l.employee.firstName} ${l.employee.lastName} ?`, reasonLabel: "Motif du refus (communiqué au salarié)", reasonRequired: true, confirmLabel: "Refuser", danger: true });
      if (!r) return;
      note = r;
    }
    if (action === "cancel" && !(await confirmDialog({ title: "Annuler cette demande ?", message: l.status === "APPROVED" ? "Le congé sera retiré ; replanifiez les shifts si nécessaire." : undefined, confirmLabel: "Annuler la demande", danger: true }))) return;
    try {
      const r = await api<{ replacedShifts: number }>(`/api/leaves/${l.id}`, { method: "PATCH", body: { action, note } });
      toast.success(action === "approve" ? `Congé approuvé.${r.replacedShifts ? ` ${r.replacedShifts} shift(s) retiré(s) du planning.` : ""} Le salarié est notifié.` : action === "reject" ? "Demande refusée." : "Demande annulée.");
      refresh();
    } catch {}
  }

  return (
    <div>
      <PageHeader title="Gestion des congés" subtitle="Validez et suivez les demandes d'absence" actions={<Button onClick={() => setAdding(true)}><Plus /> Nouvelle demande</Button>} />
      {canEditPolicy && <PolicyPanel />}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 pt-3">
          {[["PENDING", "En attente"], ["APPROVED", "Approuvés"], ["REJECTED", "Refusés"], ["ALL", "Tous"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v!)} className={cn("-mb-px inline-flex h-10 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-medium transition", status === v ? "border-brand-500 text-text" : "border-transparent text-muted hover:text-text")}>
              {l}<span className={cn("rounded-full px-1.5 text-[11px] tabular", v === "PENDING" && counts.PENDING ? "bg-warning-100 text-[#9a6a00] dark:text-warning" : "bg-surface-2")}>{v === "ALL" ? total : (counts[v!] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un salarié…" className="h-9 pl-9" aria-label="Rechercher" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-auto" aria-label="Type"><option value="">Tous les types</option>{LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}</Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 w-auto" aria-label="Tri"><option value="recent">Plus récentes</option><option value="oldest">Plus anciennes</option><option value="start">Date de début</option></Select>
        </div>
        {list.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : !list.data?.items.length ? (
          <EmptyState icon={<CalendarCheck2 />} title={status === "PENDING" ? "Aucune demande en attente" : "Aucune demande"} action={<Button variant="secondary" onClick={() => setAdding(true)}><Plus /> Nouvelle demande</Button>}>{status === "PENDING" ? "Tout est traité. Les nouvelles demandes apparaîtront ici et vous serez notifié(e)." : "Aucune demande ne correspond à ces filtres."}</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr>{["Salarié", "Type", "Période", "Durée", "Statut", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {list.data.items.map((l) => {
                  const [sl, st] = STATUS[l.status]!;
                  const name = `${l.employee.firstName} ${l.employee.lastName}`;
                  return (
                    <tr key={l.id} className="align-top hover:bg-surface-2/50">
                      <td className={td}><div className="flex items-center gap-3"><Avatar name={name} size={32} /><div><div className="font-medium">{name}</div><div className="text-xs text-muted">{l.employee.position ?? ""}</div></div></div></td>
                      <td className={td}><div>{l.label}</div>{l.comment && <div className="mt-0.5 max-w-xs truncate text-xs text-muted" title={l.comment}>« {l.comment} »</div>}</td>
                      <td className={cn(td, "whitespace-nowrap text-[13px]")}>Du {frDate(l.startDate)}{l.halfDayStart ? " (après-midi)" : ""}<br />au {frDate(l.endDate)}{l.halfDayEnd ? " (matin)" : ""}</td>
                      <td className={cn(td, "font-semibold tabular")}>{l.days} j</td>
                      <td className={td}>
                        <StatusPill tone={st}>{sl}</StatusPill>
                        {l.decidedBy && l.status !== "PENDING" && <div className="mt-1 text-[11px] text-muted">par {l.decidedBy.firstName} {l.decidedBy.lastName}</div>}
                        {l.decisionNote && <div className="mt-0.5 max-w-[200px] text-[11px] text-muted">« {l.decisionNote} »</div>}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        <div className="flex justify-end gap-1.5">
                          {l.attachmentUrl && <Tooltip content="Voir la pièce jointe"><a href={l.attachmentUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-text" aria-label="Voir la pièce jointe"><Paperclip className="size-4" /></a></Tooltip>}
                          {l.canDecide && <><Button size="sm" variant="secondary" onClick={() => decide(l, "reject")}><X /> Refuser</Button><Button size="sm" onClick={() => decide(l, "approve")}><Check /> Approuver</Button></>}
                          {(l.status === "PENDING" || l.status === "APPROVED") && !l.canDecide && <Button size="sm" variant="ghost" onClick={() => decide(l, "cancel")}><Ban /> Annuler</Button>}
                          {l.status === "APPROVED" && l.canDecide === false && null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <NewLeaveModal employees={employees} selfEmployeeId={selfEmployeeId} defaultEmployeeId={defaultEmployeeId} today={today} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); setStatus("PENDING"); refresh(); }} />}
    </div>
  );
}

function PolicyPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Policy[] | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || items) return;
    void api<{ items: Policy[] }>("/api/leave-policy").then((r) => {
      const all: Policy["leaveType"][] = ["PAID_LEAVE", "RTT", "REPOS_COMPENSATEUR"];
      setItems(all.map((t) => r.items.find((p) => p.leaveType === t) ?? { leaveType: t, enabled: false, countingMethod: "OUVRES", accruedPerMonth: null, annualAllowance: null, annualCap: null, periodStart: "01-01", allowAdvanceFirstYear: false }));
    });
  }, [open, items]);
  const set = (i: number, patch: Partial<Policy>) => setItems((s) => s!.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
  async function save() {
    setSaving(true);
    try {
      await api("/api/leave-policy", { method: "PUT", body: { policies: items } });
      toast.success("Politique de congés enregistrée. Les soldes sont recalculés automatiquement.");
    } catch {}
    setSaving(false);
  }
  return (
    <Card className="mb-5">
      <button onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left" aria-expanded={open}>
        <div className="grid size-9 place-items-center rounded-[10px] bg-brand-100 text-brand-700 dark:text-brand-400"><Settings2 className="size-[18px]" /></div>
        <div className="flex-1"><div className="text-[15px] font-semibold">Politique de congés</div><div className="text-[13px] text-muted">Règles de calcul des soldes, adaptables à votre convention</div></div>
        <ChevronDown className={cn("size-5 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border p-5 animate-fade-in">
          {!items ? <Skeleton className="h-48" /> : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {items.map((p, i) => (
                  <div key={p.leaveType} className={cn("rounded-[14px] border p-4 transition", p.enabled ? "border-brand-500/40" : "border-border opacity-80")}>
                    <Checkbox checked={p.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} label={<b>{LEAVE_TYPE_LABELS[p.leaveType]}</b>} />
                    <div className={cn("mt-4 grid grid-cols-2 gap-3", !p.enabled && "pointer-events-none opacity-50")}>
                      <Field label="Méthode de décompte" className="col-span-2"><Select value={p.countingMethod} onChange={(e) => set(i, { countingMethod: e.target.value as Policy["countingMethod"] })}><option value="OUVRABLES">Jours ouvrables (lun.–sam.)</option><option value="OUVRES">Jours ouvrés (lun.–ven.)</option></Select></Field>
                      <Field label="Acquis / mois (j)"><Input inputMode="decimal" value={p.accruedPerMonth ?? ""} onChange={(e) => set(i, { accruedPerMonth: n(e.target.value) })} /></Field>
                      <Field label="Dotation annuelle (j)"><Input inputMode="decimal" value={p.annualAllowance ?? ""} onChange={(e) => set(i, { annualAllowance: n(e.target.value) })} /></Field>
                      <Field label="Plafond annuel (j)"><Input inputMode="decimal" value={p.annualCap ?? ""} onChange={(e) => set(i, { annualCap: n(e.target.value) })} /></Field>
                      <Field label="Début période (MM-JJ)"><Input value={p.periodStart} onChange={(e) => set(i, { periodStart: e.target.value })} className="font-mono" /></Field>
                      <div className="col-span-2"><Checkbox checked={p.allowAdvanceFirstYear} onChange={(e) => set(i, { allowAdvanceFirstYear: e.target.checked })} label="Congés anticipés la 1ʳᵉ année" /></div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">Jours <b>ouvrables</b> : du lundi au samedi, hors jours fériés. Jours <b>ouvrés</b> : du lundi au vendredi, hors jours fériés. Les jours fériés sont toujours exclus. Au Maroc : 1,5 jour par mois de service, soit 18 jours ouvrables par an (Code du travail, art. 231).</p>
              <div className="mt-4 flex justify-end"><Button onClick={save} loading={saving}>Enregistrer</Button></div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
