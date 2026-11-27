"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, Paperclip, Wallet } from "lucide-react";
import { LEAVE_TYPE_LABELS, LEAVE_TYPES, type LeaveType } from "@yghr/core";
import { Button, Checkbox, cn, Field, Input, Modal, Segmented, Select, Textarea } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { EntitlementDeclare } from "./entitlement-declare";

interface Preview { balance: { acquired: number; taken: number; pending: number; available: number; entitlement: number | null; needsDeclaration: boolean; periodYear: number } | null; days: number; method: string; warnings: string[] }

export function NewLeaveModal({ employees, selfEmployeeId, defaultEmployeeId, today, onClose, onCreated }: { employees: { id: string; name: string }[]; selfEmployeeId: string | null; defaultEmployeeId?: string | null; today: string; onClose: () => void; onCreated: () => void }) {
  const canPickOthers = employees.length > 0;
  const [who, setWho] = useState<"me" | "other">(defaultEmployeeId && defaultEmployeeId !== selfEmployeeId ? "other" : selfEmployeeId ? "me" : "other");
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId && defaultEmployeeId !== selfEmployeeId ? defaultEmployeeId : "");
  const [type, setType] = useState<LeaveType>("PAID_LEAVE");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfStart, setHalfStart] = useState(false);
  const [halfEnd, setHalfEnd] = useState(false);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const target = who === "me" ? selfEmployeeId : employeeId;
  useEffect(() => { if (end < start) setEnd(start); }, [start, end]);
  const preview = useQuery({
    queryKey: ["leave-preview", target, type, start, end, halfStart, halfEnd],
    enabled: !!target,
    queryFn: () => api<Preview>(`/api/leaves/balance?${new URLSearchParams({ ...(target ? { employeeId: target } : {}), type, startDate: start, endDate: end, halfDayStart: String(halfStart), halfDayEnd: String(halfEnd) })}`, { silent: true }),
    placeholderData: (p) => p,
  });
  const p = preview.data;
  const unit = p?.method === "OUVRES" ? "ouvrés" : "ouvrables";
  const remaining = p?.balance ? Math.max(0, Math.round((p.balance.available - p.balance.pending) * 100) / 100) : null;
  const blocked = !!p?.balance && (p.balance.needsDeclaration || p.days > remaining!);

  async function submit() {
    if (!target) return toast.error("Choisissez le bénéficiaire.");
    setSaving(true);
    const form = new FormData();
    form.append("employeeId", target);
    form.append("type", type);
    form.append("startDate", start);
    form.append("endDate", end);
    form.append("halfDayStart", String(halfStart));
    form.append("halfDayEnd", String(halfEnd));
    if (comment) form.append("comment", comment);
    if (file) form.append("attachment", file);
    try {
      const r = await api<{ item: { days: number } }>("/api/leaves", { form });
      toast.success(`Demande envoyée (${r.item.days} j). Vous serez notifié(e) de la décision.`);
      onCreated();
    } catch {}
    setSaving(false);
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} icon={<CalendarPlus />} title="Nouvelle demande de congé" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={saving} disabled={!target || !p?.days || blocked}>Soumettre la demande</Button></>}>
      <div className="space-y-5">
        {canPickOthers && (
          <Field label="Bénéficiaire">
            <div className="flex flex-wrap items-center gap-3">
              {selfEmployeeId && <Segmented value={who} onChange={setWho} options={[{ value: "me", label: "Pour moi" }, { value: "other", label: "Un salarié" }]} />}
              {who === "other" && (
                <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="min-w-[240px] flex-1" aria-label="Salarié">
                  <option value="">Choisir un salarié…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              )}
            </div>
          </Field>
        )}
        <Field label="Type de congé" required htmlFor="lt">
          <Select id="lt" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
          </Select>
        </Field>
        {target && p?.balance?.needsDeclaration && <EntitlementDeclare compact year={p.balance.periodYear} employeeId={target} forSelf={target === selfEmployeeId} onDone={() => void preview.refetch()} />}
        {target && p?.balance && !p.balance.needsDeclaration && (
          <div className={cn("flex items-start gap-3 rounded-[12px] border p-3.5 text-sm", p.days > remaining! ? "border-danger/40 bg-danger-100/50" : "border-brand-500/25 bg-brand-100/40")} aria-live="polite">
            <Wallet className="mt-0.5 size-4 shrink-0 text-brand-500" />
            <div>
              Solde disponible : <b className="tabular">{remaining} j {unit}</b> <span className="text-muted">({p.balance.entitlement !== null ? `droit annuel ${p.balance.entitlement}` : `acquis ${p.balance.acquired}`} · pris {p.balance.taken}{p.balance.pending ? ` · en attente ${p.balance.pending}` : ""})</span>, <b className="tabular">{p.days} j demandés</b>
              {p.days > remaining! && <div className="mt-1 font-medium text-danger">Solde insuffisant : la demande ne peut pas être envoyée.</div>}
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date de début" required htmlFor="ls">
            <Input id="ls" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Checkbox label="Commencer l'après-midi" checked={halfStart} onChange={(e) => setHalfStart(e.target.checked)} />
          </Field>
          <Field label="Date de fin" required htmlFor="le">
            <Input id="le" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            <Checkbox label="Finir le matin" checked={halfEnd} onChange={(e) => setHalfEnd(e.target.checked)} />
          </Field>
        </div>
        {target && p && !p.balance && <p className="text-sm text-muted">Durée décomptée : <b className="text-text tabular">{p.days} j {unit}</b> (jours fériés exclus).</p>}
        {!!p?.warnings.length && (
          <ul className="space-y-1.5 rounded-[12px] border border-warning/40 bg-warning-100/40 p-3.5 text-[13px]">
            {p.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />{w}</li>)}
          </ul>
        )}
        <Field label="Commentaire / justification" htmlFor="lc"><Textarea id="lc" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <Field label="Pièce jointe (optionnel)" help="PDF, JPG ou PNG, 8 Mo maximum. Exemple : certificat médical.">
          <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-border px-3 py-2.5 text-sm hover:border-brand-500">
            <Paperclip className="size-4 text-muted" />
            <span className={cn("flex-1 truncate", !file && "text-muted")}>{file?.name ?? "Choisir un fichier…"}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
      </div>
    </Modal>
  );
}
