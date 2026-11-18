"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, cn, EmptyState, Field, Input, Modal, Select, SeverityBadge, td, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";
import type { RulesData } from "./rules-module";
import { DAY_SHORT, daysLabel, type CoverageRow } from "./types";

export function CoverageTab({ coverage, shiftTypes, services, categories }: RulesData) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<CoverageRow> | null>(null);
  const name = <T extends { id: string; name: string }>(list: T[], id: string | null, fallback = "Tous") => (id ? (list.find((x) => x.id === id)?.name ?? "—") : fallback);
  async function remove(c: CoverageRow) {
    if (!(await confirmDialog({ title: "Supprimer cette règle de couverture ?", danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/coverage-rules/${c.id}`, { method: "DELETE" });
    toast.success("Règle de couverture supprimée.");
    router.refresh();
  }
  const blank: Partial<CoverageRow> = { min: 1, max: null, days: [], severity: "BLOCKING", active: true, serviceId: null, staffCategoryId: null };
  return (
    <Card>
      <CardHeader title="Couverture" subtitle="Effectif minimum (et maximum facultatif) par shift. Exemples : « Minimum 3 infirmières le matin », « Minimum 1 responsable de service par shift »." actions={<Button size="sm" onClick={() => setEditing(blank)}><Plus /> Ajouter une règle de couverture</Button>} />
      {coverage.length === 0 ? (
        <EmptyState icon={<Layers />} title="Aucune règle de couverture" action={<Button onClick={() => setEditing(blank)}><Plus /> Ajouter une règle</Button>}>Fixez un effectif minimum par shift : le planning signalera les shifts en sous-effectif.</EmptyState>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr>{["Shift", "Service", "Catégorie", "Minimum", "Maximum", "Jours", "Gravité", "Active", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {coverage.map((c) => {
                const st = shiftTypes.find((s) => s.id === c.shiftTypeId);
                return (
                  <tr key={c.id} className={cn("hover:bg-surface-2/50", !c.active && "opacity-60")}>
                    <td className={td}>
                      <span className="inline-flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: st?.color }} />{st?.name ?? "—"}</span>
                      {c.label && <div className="text-xs text-muted">{c.label}</div>}
                    </td>
                    <td className={td}>{name(services, c.serviceId)}</td>
                    <td className={td}>{name(categories, c.staffCategoryId, "Toutes")}</td>
                    <td className={cn(td, "font-semibold tabular")}>{c.min}</td>
                    <td className={cn(td, "tabular")}>{c.max ?? "—"}</td>
                    <td className={cn(td, "text-[13px]")}>{daysLabel(c.days)}</td>
                    <td className={td}><SeverityBadge severity={c.severity} /></td>
                    <td className={td}><Toggle size="sm" checked={c.active} onChange={async (v) => { await api(`/api/coverage-rules/${c.id}`, { method: "PATCH", body: { active: v } }); router.refresh(); }} /></td>
                    <td className={cn(td, "whitespace-nowrap text-right")}>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Modifier"><Pencil /></Button>
                      <Button size="icon-sm" variant="danger-ghost" onClick={() => remove(c)} aria-label="Supprimer"><Trash2 /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CoverageModal value={editing} data={{ shiftTypes, services, categories }} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </Card>
  );
}

function CoverageModal({ value, data, onClose, onSaved }: { value: Partial<CoverageRow>; data: Pick<RulesData, "shiftTypes" | "services" | "categories">; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState(value);
  const [saving, setSaving] = useState(false);
  const days = c.days ?? [];
  async function save() {
    if (c.max !== null && c.max !== undefined && c.max < (c.min ?? 0)) return toast.error("Le maximum doit être supérieur ou égal au minimum.");
    setSaving(true);
    const body = { shiftTypeId: c.shiftTypeId, serviceId: c.serviceId ?? null, staffCategoryId: c.staffCategoryId ?? null, min: c.min ?? 0, max: c.max ?? null, days, severity: c.severity, active: c.active ?? true, label: c.label || null };
    try {
      if (c.id) await api(`/api/coverage-rules/${c.id}`, { method: "PATCH", body });
      else await api("/api/coverage-rules", { body });
      toast.success("Règle de couverture enregistrée.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={c.id ? "Modifier la couverture" : "Ajouter une règle de couverture"} icon={<Layers />} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!c.shiftTypeId}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shift" required htmlFor="cs" className="sm:col-span-2">
          <Select id="cs" value={c.shiftTypeId ?? ""} onChange={(e) => setC({ ...c, shiftTypeId: e.target.value })}>
            <option value="">Choisir…</option>
            {data.shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}
          </Select>
        </Field>
        <Field label="Service" htmlFor="csv"><Select id="csv" value={c.serviceId ?? ""} onChange={(e) => setC({ ...c, serviceId: e.target.value || null })}><option value="">Tous</option>{data.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Catégorie" htmlFor="ccat"><Select id="ccat" value={c.staffCategoryId ?? ""} onChange={(e) => setC({ ...c, staffCategoryId: e.target.value || null })}><option value="">Toutes</option>{data.categories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Minimum" required htmlFor="cmin"><Input id="cmin" type="number" min={0} value={c.min ?? 0} onChange={(e) => setC({ ...c, min: Number(e.target.value) })} /></Field>
        <Field label="Maximum" htmlFor="cmax" help="Facultatif"><Input id="cmax" type="number" min={0} value={c.max ?? ""} onChange={(e) => setC({ ...c, max: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-[13px] font-medium">Jours</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setC({ ...c, days: [] })} className={cn("h-9 cursor-pointer rounded-[10px] border px-3 text-sm", !days.length ? "border-brand-500 bg-brand-500 text-white dark:text-brand-900" : "border-border")}>Tous les jours</button>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = days.includes(d);
              return <button key={d} type="button" aria-pressed={on} onClick={() => setC({ ...c, days: on ? days.filter((x) => x !== d) : [...days, d] })} className={cn("h-9 w-12 cursor-pointer rounded-[10px] border text-sm", on ? "border-brand-500 bg-brand-100 text-brand-700 dark:text-brand-400" : "border-border")}>{DAY_SHORT[d]}</button>;
            })}
          </div>
        </div>
        <Field label="Gravité" htmlFor="csev"><Select id="csev" value={c.severity} onChange={(e) => setC({ ...c, severity: e.target.value as "BLOCKING" | "WARNING" })}><option value="BLOCKING">Bloquante</option><option value="WARNING">Avertissement</option></Select></Field>
        <Field label="Libellé" htmlFor="clab" help="ex. Minimum 2 infirmières le matin"><Input id="clab" value={c.label ?? ""} onChange={(e) => setC({ ...c, label: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
