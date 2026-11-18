"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Download, FileArchive, FileText, Lock, LockOpen, Plus, Search, Trash2 } from "lucide-react";
import { monthNameFr, type PayslipLine } from "@yghr/core";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Field, Input, Select, SideSheet, Skeleton, StatusPill, td, th, Tooltip } from "@yghr/ui";
import { toast } from "sonner";
import { api, download } from "@/lib/api";
import { dh, hours, num } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import { Stepper } from "./payroll-list";

interface Slip { id: string; employee: { id: string; firstName: string; lastName: string; matricule: string | null; position: string | null }; hours: Record<string, number>; lines: PayslipLine[]; gross: number; cnss: number; amo: number; ipe: number; profExpenses: number; taxableNet: number; ir: number; net: number; employer: Record<string, number>; warnings: string[] }
interface El { id: string; employeeId: string; kind: string; label: string; amount: number; taxable: boolean; cnssSubject: boolean; auto: boolean }
interface Data { period: { id: string; month: number; year: number; status: string; fiscal: string | null; calculatedAt: string | null }; unvalidatedDays: number; payslips: Slip[]; elements: El[] }
const KIND: Record<string, string> = { PRIME: "Prime", TRANSPORT: "Transport", ADVANCE: "Acompte", EXPENSE: "Note de frais", DEDUCTION: "Retenue" };

export function PayrollDetail({ id, base, isRh }: { id: string; base: string; isRh: boolean }) {
  const q = useQuery({ queryKey: ["period", id], queryFn: () => api<Data>(`/api/payroll/periods/${id}/payslips`) });
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Slip | null>(null);
  const d = q.data;
  const status = d?.period.status ?? "DRAFT";
  const editable = status === "DRAFT" || status === "CALCULATED";
  const list = useMemo(() => (d?.payslips ?? []).filter((p) => `${p.employee.firstName} ${p.employee.lastName} ${p.employee.matricule ?? ""}`.toLowerCase().includes(search.toLowerCase())), [d, search]);
  const sum = (k: keyof Slip) => (d?.payslips ?? []).reduce((t, p) => t + (p[k] as number), 0);
  const employerTotal = (d?.payslips ?? []).reduce((t, p) => t + (p.employer.total ?? 0), 0);

  async function action(a: "calculate" | "validate" | "lock" | "unlock") {
    let reason: string | undefined;
    if (a === "unlock") {
      const r = await confirmDialog({ title: "Déverrouiller la période ?", message: "Les bulletins redeviennent modifiables. Le déverrouillage est tracé dans le journal d'audit.", reasonLabel: "Motif du déverrouillage", reasonRequired: true, confirmLabel: "Déverrouiller", danger: true });
      if (!r) return;
      reason = r;
    }
    if (a === "lock" && !(await confirmDialog({ title: "Verrouiller la période ?", message: "Plus aucune modification ne sera possible. Les bulletins seront publiés dans l'espace des salariés.", confirmLabel: "Verrouiller" }))) return;
    setBusy(a);
    try {
      const r = await api<{ message?: string }>(`/api/payroll/periods/${id}/${a}`, { body: { reason } });
      toast.success(r.message ?? { calculate: "Calcul terminé.", validate: "Période validée.", lock: "Période verrouillée : les bulletins sont disponibles pour les salariés.", unlock: "Période déverrouillée." }[a]);
      await q.refetch();
    } catch {}
    setBusy(null);
  }

  if (!d) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  const title = `${monthNameFr(d.period.month)} ${d.period.year}`.replace(/^./, (c) => c.toUpperCase());
  return (
    <div>
      <Link href={`${base}/paie`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Paie</Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold">Paie — {title}</h1>
          <div className="mt-2"><Stepper status={status} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <Button variant={status === "DRAFT" ? "primary" : "secondary"} onClick={() => action("calculate")} loading={busy === "calculate"}><Calculator /> {d.payslips.length ? "Recalculer" : "Calculer"}</Button>}
          {status === "CALCULATED" && <Button onClick={() => action("validate")} loading={busy === "validate"}><CheckCircle2 /> Valider</Button>}
          {status === "VALIDATED" && isRh && <Button onClick={() => action("lock")} loading={busy === "lock"}><Lock /> Verrouiller</Button>}
          {(status === "VALIDATED" || status === "LOCKED") && isRh && <Button variant="ghost" onClick={() => action("unlock")} loading={busy === "unlock"}><LockOpen /> Déverrouiller</Button>}
          <Button variant="secondary" disabled={!d.payslips.length} onClick={() => download(`/api/payroll/periods/${id}/export`, "journal-paie.xlsx")}><Download /> Exporter</Button>
          <Button variant="secondary" disabled={!d.payslips.length} onClick={() => download(`/api/payroll/periods/${id}/pdfs`, "bulletins.zip")}><FileArchive /> Bulletins PDF</Button>
        </div>
      </div>

      {d.unvalidatedDays > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-[12px] border border-warning/40 bg-warning-100/50 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div><b>{d.unvalidatedDays} journée(s) de présence ne sont pas validées</b> sur ce mois. La paie utilise les heures pointées telles quelles ; validez-les dans Présences → Corriger les pointages pour figer les heures.</div>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Effectif", String(d.payslips.length)], ["Brut", dh(sum("gross"), 0)], ["Retenues sociales", dh(sum("cnss") + sum("amo") + sum("ipe"), 0)], ["IR", dh(sum("ir"), 0)], ["Net à payer", dh(sum("net"), 0)]].map(([k, v]) => (
          <Card key={k} className="px-4 py-3"><div className="text-xs text-muted">{k}</div><div className="mt-1 font-display text-lg font-bold tabular">{v}</div></Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un salarié…" className="h-9 pl-9" aria-label="Rechercher" />
          </div>
          <span className="text-xs text-muted">Charges patronales : <b className="tabular text-text">{dh(employerTotal, 0)}</b>{d.period.fiscal ? ` · ${d.period.fiscal}` : ""}</span>
        </div>
        {!d.payslips.length ? (
          <EmptyState icon={<Calculator />} title="Aucun bulletin calculé" action={editable ? <Button onClick={() => action("calculate")} loading={busy === "calculate"}><Calculator /> Calculer la paie</Button> : undefined}>Le calcul reprend les heures pointées du mois, les éléments variables, les acomptes et les règles CNSS, AMO et IR.</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead><tr>{["Salarié", "H. travaillées", "H. nuit", "H. sup", "Brut", "CNSS", "AMO", "IR", "Net", ""].map((h, i) => <th key={h + i} className={cn(th, i > 0 && i < 9 && "text-right")}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((p) => {
                  const worked = (p.hours.normalMinutes ?? 0) + (p.hours.overtimeDayMinutes ?? 0) + (p.hours.overtimeNightMinutes ?? 0) + (p.hours.restDayDayMinutes ?? 0) + (p.hours.restDayNightMinutes ?? 0);
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setOpen(p)}>
                      <td className={td}><div className="flex items-center gap-3"><Avatar name={`${p.employee.firstName} ${p.employee.lastName}`} size={30} /><div><div className="font-medium">{p.employee.lastName} {p.employee.firstName}</div><div className="font-mono text-[11px] text-muted">{p.employee.matricule}</div></div></div></td>
                      <td className={cn(td, "text-right font-mono tabular")}>{hours(worked)}</td>
                      <td className={cn(td, "text-right font-mono tabular")}>{p.hours.nightMinutes ? hours(p.hours.nightMinutes) : "—"}</td>
                      <td className={cn(td, "text-right font-mono tabular")}>{(p.hours.overtimeDayMinutes ?? 0) + (p.hours.overtimeNightMinutes ?? 0) ? hours((p.hours.overtimeDayMinutes ?? 0) + (p.hours.overtimeNightMinutes ?? 0)) : "—"}</td>
                      <td className={cn(td, "text-right font-mono tabular")}>{num(p.gross, 2)}</td>
                      <td className={cn(td, "text-right font-mono tabular text-muted")}>{num(p.cnss, 2)}</td>
                      <td className={cn(td, "text-right font-mono tabular text-muted")}>{num(p.amo, 2)}</td>
                      <td className={cn(td, "text-right font-mono tabular text-muted")}>{num(p.ir, 2)}</td>
                      <td className={cn(td, "text-right font-mono font-semibold tabular")}>{num(p.net, 2)}</td>
                      <td className={cn(td, "text-right")}>{p.warnings.length > 0 && <Tooltip content={p.warnings.join(" · ")}><span className="inline-flex items-center gap-1 text-xs text-[#9a6a00] dark:text-warning"><AlertTriangle className="size-3.5" />{p.warnings.length}</span></Tooltip>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <SlipSheet slip={open} elements={d.elements.filter((e) => e.employeeId === open.employee.id)} periodId={id} editable={editable && isRh} onClose={() => setOpen(null)} onChanged={() => q.refetch().then((r) => setOpen(r.data?.payslips.find((x) => x.id === open.id) ?? null))} />}
    </div>
  );
}

function SlipSheet({ slip, elements, periodId, editable, onClose, onChanged }: { slip: Slip; elements: El[]; periodId: string; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({ kind: "PRIME", label: "", amount: "", taxable: true, cnssSubject: true });
  const [adding, setAdding] = useState(false);
  const setKind = (kind: string) => setForm({ ...form, kind, taxable: kind === "PRIME", cnssSubject: kind === "PRIME", label: form.label || (kind === "TRANSPORT" ? "Indemnité de transport" : kind === "DEDUCTION" ? "Retenue" : kind === "PRIME" ? "Prime" : "") });
  async function add() {
    setAdding(true);
    try {
      await api(`/api/payroll/periods/${periodId}/elements`, { body: { employeeId: slip.employee.id, kind: form.kind, label: form.label, amount: Number(form.amount.replace(",", ".")), taxable: form.taxable, cnssSubject: form.cnssSubject } });
      toast.success("Élément ajouté. Recalculez la période pour mettre à jour le bulletin.");
      setForm({ kind: "PRIME", label: "", amount: "", taxable: true, cnssSubject: true });
      onChanged();
    } catch {}
    setAdding(false);
  }
  async function remove(e: El) {
    await api(`/api/payroll/periods/${periodId}/elements?elementId=${e.id}`, { method: "DELETE" });
    toast.success("Élément supprimé. Recalculez la période.");
    onChanged();
  }
  const fmt = (v?: number) => (v ? num(v, 2) : "");
  return (
    <SideSheet open onOpenChange={(o) => !o && onClose()} width={640} title={`${slip.employee.lastName} ${slip.employee.firstName}`} subtitle={slip.employee.position ?? undefined} footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => download(`/api/payroll/payslips/${slip.id}/pdf`, "bulletin.pdf")}><FileText /> Bulletin PDF</Button></div>}>
      <div className="space-y-5 p-5">
        {slip.warnings.length > 0 && <ul className="space-y-1 rounded-[12px] border border-warning/40 bg-warning-100/50 p-3 text-[13px]">{slip.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />{w}</li>)}</ul>}
        <div className="overflow-hidden rounded-[12px] border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 text-left">Rubrique</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Taux</th><th className="px-3 py-2 text-right">Gains</th><th className="px-3 py-2 text-right">Retenues</th></tr></thead>
            <tbody>
              {slip.lines.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5">{l.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular text-muted">{fmt(l.base)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular text-muted">{l.rate === undefined ? "" : l.rate < 1 ? `${num(l.rate * 100, 2)} %` : num(l.rate, 2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular">{fmt(l.gain)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular">{fmt(l.deduction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          {[["Brut imposable", slip.gross], ["Frais professionnels", slip.profExpenses], ["Net imposable", slip.taxableNet], ["IR", slip.ir]].map(([k, v]) => <div key={k as string} className="flex justify-between rounded-[10px] bg-surface-2 px-3 py-2"><span className="text-muted">{k as string}</span><span className="font-mono tabular">{num(v as number, 2)}</span></div>)}
        </div>
        <div className="flex items-center justify-between rounded-[14px] bg-brand-900 px-5 py-4 text-white">
          <span className="text-sm text-white/70">Net à payer</span>
          <span className="font-display text-2xl font-bold tabular">{dh(slip.net)}</span>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Éléments variables</h4>
          <ul className="space-y-1.5">
            {elements.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2 text-sm">
                <StatusPill tone={e.kind === "DEDUCTION" || e.kind === "ADVANCE" ? "danger" : "brand"}>{KIND[e.kind]}</StatusPill>
                <span className="flex-1">{e.label}{!e.taxable && <span className="ml-1.5 text-xs text-muted">(non imposable)</span>}</span>
                <span className="font-mono tabular">{dh(e.amount)}</span>
                {editable && !e.auto && <button onClick={() => remove(e)} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted hover:bg-danger-100 hover:text-danger" aria-label="Supprimer"><Trash2 className="size-3.5" /></button>}
              </li>
            ))}
            {!elements.length && <li className="text-sm text-muted">Aucun élément variable.</li>}
          </ul>
          {editable && (
            <div className="mt-3 rounded-[12px] border border-dashed border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[140px_1fr_110px]">
                <Select value={form.kind} onChange={(e) => setKind(e.target.value)} className="h-9" aria-label="Type">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Libellé" className="h-9" aria-label="Libellé" />
                <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Montant DH" inputMode="decimal" className="h-9 font-mono" aria-label="Montant" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Checkbox label="Imposable" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} />
                <Checkbox label="Soumis CNSS" checked={form.cnssSubject} onChange={(e) => setForm({ ...form, cnssSubject: e.target.checked })} />
                <Button size="sm" className="ml-auto" onClick={add} loading={adding} disabled={!form.label || !form.amount}><Plus /> Ajouter</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SideSheet>
  );
}

