"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Check, Coins, Paperclip, Plus, Receipt, X } from "lucide-react";
import { Avatar, Button, Card, cn, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, StatusPill, Textarea, td, th } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dh, frDate } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";

type Mode = "advances" | "expenses";
interface Row { id: string; employee: { id: string; firstName: string; lastName: string; position: string | null }; amount: number; status: string; createdAt: string; canDecide: boolean; reason?: string | null; decisionNote?: string | null; date?: string; category?: string; description?: string | null; vat?: number | null; receiptUrl?: string | null; reimbursement?: string }
const ST: Record<string, [string, "warning" | "success" | "danger" | "neutral"]> = { PENDING: ["En attente", "warning"], APPROVED: ["Approuvée", "success"], REJECTED: ["Refusée", "danger"], CANCELLED: ["Annulée", "neutral"] };
const CATEGORIES = ["Transport", "Repas", "Hébergement", "Fournitures", "Formation", "Téléphone", "Autre"];

export function RequestsModule({ mode, selfEmployeeId, today, manage }: { mode: Mode; selfEmployeeId: string | null; today: string; manage: boolean }) {
  const url = mode === "advances" ? "/api/advance-requests" : "/api/expenses";
  const q = useQuery({ queryKey: [mode], queryFn: () => api<{ items: Row[] }>(url) });
  const [filter, setFilter] = useState<"PENDING" | "ALL">(manage ? "PENDING" : "ALL");
  const [open, setOpen] = useState(false);
  const list = (q.data?.items ?? []).filter((r) => filter === "ALL" || r.status === "PENDING");
  const pending = (q.data?.items ?? []).filter((r) => r.status === "PENDING").length;
  const title = mode === "advances" ? "Demandes d'Acompte" : "Notes de frais";

  async function decide(r: Row, action: "approve" | "reject" | "cancel") {
    let note: string | undefined;
    if (action === "reject") {
      const v = await confirmDialog({ title: "Refuser cette demande ?", reasonLabel: "Motif du refus", reasonRequired: true, confirmLabel: "Refuser", danger: true });
      if (!v) return;
      note = v;
    }
    if (action === "cancel" && !(await confirmDialog({ title: "Annuler cette demande ?", confirmLabel: "Annuler la demande", danger: true }))) return;
    try {
      await api(`${url}/${r.id}`, { method: "PATCH", body: { action, note } });
      toast.success(action === "approve" ? (mode === "advances" ? "Acompte approuvé : il sera retenu sur la prochaine paie et la comptabilité est prévenue." : "Note de frais approuvée.") : action === "reject" ? "Demande refusée." : "Demande annulée.");
      void q.refetch();
    } catch {}
  }

  return (
    <div>
      <PageHeader title={title} subtitle={mode === "advances" ? "Avances sur salaire, retenues automatiquement sur la paie suivante" : "Dépenses professionnelles avec justificatifs, remboursées en paie ou séparément"} actions={selfEmployeeId && <Button onClick={() => setOpen(true)}><Plus /> {mode === "advances" ? "Demander un acompte" : "Nouvelle note de frais"}</Button>} />
      <Card>
        {manage && <div className="p-4"><Segmented value={filter} onChange={setFilter} options={[{ value: "PENDING", label: "À traiter", count: pending }, { value: "ALL", label: "Toutes" }]} /></div>}
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : !list.length ? (
          <EmptyState icon={mode === "advances" ? <Coins /> : <Receipt />} title={filter === "PENDING" ? "Rien à traiter" : "Aucune demande"}>{mode === "advances" ? "Les demandes d'acompte apparaîtront ici." : "Ajoutez une dépense avec la photo du reçu : elle sera remboursée après validation."}</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr>{[...(manage ? ["Salarié"] : []), mode === "advances" ? "Motif" : "Dépense", "Montant", "Date", "Statut", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((r) => {
                  const [sl, tone] = ST[r.status]!;
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      {manage && <td className={td}><div className="flex items-center gap-3"><Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size={30} /><div><div className="font-medium">{r.employee.firstName} {r.employee.lastName}</div><div className="text-xs text-muted">{r.employee.position ?? ""}</div></div></div></td>}
                      <td className={td}>{mode === "advances" ? (r.reason ?? <span className="text-muted">—</span>) : <><div className="font-medium">{r.category}</div><div className="text-xs text-muted">{r.description ?? ""}{r.reimbursement === "SEPARATE" ? " · remboursement séparé" : ""}</div></>}</td>
                      <td className={cn(td, "font-mono font-semibold tabular")}>{dh(r.amount)}{r.vat ? <div className="text-[11px] font-normal text-muted">dont TVA {dh(r.vat)}</div> : null}</td>
                      <td className={cn(td, "text-[13px]")}>{frDate(r.date ?? r.createdAt)}</td>
                      <td className={td}><StatusPill tone={tone}>{sl}</StatusPill>{r.decisionNote && <div className="mt-1 text-[11px] text-muted">« {r.decisionNote} »</div>}</td>
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        <div className="flex justify-end gap-1.5">
                          {r.receiptUrl && <a href={r.receiptUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-[10px] text-muted hover:bg-surface-2" aria-label="Voir le justificatif"><Paperclip className="size-4" /></a>}
                          {r.canDecide && <><Button size="sm" variant="secondary" onClick={() => decide(r, "reject")}><X /> Refuser</Button><Button size="sm" onClick={() => decide(r, "approve")}><Check /> Approuver</Button></>}
                          {r.status === "PENDING" && r.employee.id === selfEmployeeId && <Button size="sm" variant="ghost" onClick={() => decide(r, "cancel")}><Ban /> Annuler</Button>}
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
      {open && <NewRequest mode={mode} today={today} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void q.refetch(); }} />}
    </div>
  );
}

function NewRequest({ mode, today, onClose, onDone }: { mode: Mode; today: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("Transport");
  const [vat, setVat] = useState("");
  const [reimb, setReimb] = useState<"PAYROLL" | "SEPARATE">("PAYROLL");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const n = Number(amount.replace(",", "."));
  async function submit() {
    setSaving(true);
    try {
      if (mode === "advances") await api("/api/advance-requests", { body: { amount: n, reason: reason || undefined } });
      else {
        const f = new FormData();
        Object.entries({ date, category, description: reason, amount: String(n), vat: vat.replace(",", "."), reimbursement: reimb }).forEach(([k, v]) => v && f.append(k, v));
        if (file) f.append("receipt", file);
        await api("/api/expenses", { form: f });
      }
      toast.success("Demande envoyée. Vous serez notifié(e) de la décision.");
      onDone();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} icon={mode === "advances" ? <Coins /> : <Receipt />} title={mode === "advances" ? "Demander un acompte" : "Nouvelle note de frais"} subtitle={mode === "advances" ? "L'acompte approuvé est retenu sur votre prochaine paie." : undefined} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={saving} disabled={!(n > 0)}>Envoyer</Button></>}>
      <div className="space-y-4">
        {mode === "expenses" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="xd"><Input id="xd" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Catégorie" htmlFor="xc"><Select id="xc" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (DH)" required htmlFor="xa"><Input id="xa" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" placeholder="0,00" /></Field>
          {mode === "expenses" && <Field label="dont TVA (DH)" htmlFor="xv"><Input id="xv" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} className="font-mono" /></Field>}
        </div>
        <Field label={mode === "advances" ? "Motif (optionnel)" : "Description"} htmlFor="xr"><Textarea id="xr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {mode === "expenses" && (
          <>
            <Field label="Remboursement"><Segmented value={reimb} onChange={setReimb} options={[{ value: "PAYROLL", label: "Sur la paie" }, { value: "SEPARATE", label: "Séparé" }]} /></Field>
            <Field label="Justificatif (photo ou PDF)">
              <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-border px-3 py-2.5 text-sm hover:border-brand-500">
                <Paperclip className="size-4 text-muted" /><span className={cn("flex-1 truncate", !file && "text-muted")}>{file?.name ?? "Prendre une photo ou choisir un fichier…"}</span>
                <input type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
