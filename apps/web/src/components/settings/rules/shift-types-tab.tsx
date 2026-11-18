"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Info, Moon, Pencil, Plus, Trash2 } from "lucide-react";
import { amplitudeMinutes, endsNextDay, shiftDurationMinutes } from "@yghr/core";
import { Button, Card, CardHeader, Checkbox, cn, readableText, EmptyState, Field, Input, Modal, Select, StatusPill, td, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { hm } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import type { RulesData } from "./rules-module";
import { SHIFT_COLORS, type ShiftRow } from "./types";

export function ShiftTypesTab({ shiftTypes, categories }: RulesData) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<ShiftRow> | null>(null);
  const cat = (id: string | null) => (id ? (categories.find((c) => c.id === id)?.name ?? "—") : "Toutes");
  async function toggle(s: ShiftRow, active: boolean) {
    await api(`/api/shift-types/${s.id}`, { method: "PATCH", body: { active } });
    router.refresh();
  }
  async function remove(s: ShiftRow) {
    if (!(await confirmDialog({ title: `Supprimer le shift « ${s.name} » ?`, message: "Les cellules de planning existantes gardent leurs horaires mais perdent leur type.", danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/shift-types/${s.id}`, { method: "DELETE" });
    toast.success("Shift supprimé.");
    router.refresh();
  }
  const blank: Partial<ShiftRow> = { color: SHIFT_COLORS[shiftTypes.length % SHIFT_COLORS.length], startTime: "08:00", endTime: "16:00", breakMinutes: 30, breakPaid: false, isNight: false, active: true, staffCategoryId: null };
  return (
    <Card>
      <CardHeader
        title="Types de shifts"
        subtitle="Horaires libres : une fin inférieure ou égale au début signifie que le shift se termine le lendemain. La durée est calculée automatiquement (amplitude − pause non rémunérée)."
        actions={<Button size="sm" onClick={() => setEditing(blank)}><Plus /> Ajouter un shift</Button>}
      />
      {shiftTypes.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="Aucun type de shift" action={<Button onClick={() => setEditing(blank)}><Plus /> Ajouter un shift</Button>}>Créez vos horaires types (Matin, Nuit, Garde 12 h…) pour remplir le planning en un clic.</EmptyState>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr>{["Shift", "Code", "Horaires", "Durée", "Pause", "Nuit", "Catégorie", "Actif", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {shiftTypes.map((s) => (
                <tr key={s.id} className={cn("hover:bg-surface-2/50", !s.active && "opacity-60")}>
                  <td className={td}><span className="inline-flex items-center gap-2.5 font-medium"><span className="size-3 rounded-full" style={{ background: s.color }} />{s.name}</span></td>
                  <td className={td}><span className="rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold" style={{ background: s.color, color: readableText(s.color) }}>{s.code}</span></td>
                  <td className={td}>
                    <span className="font-mono tabular">{s.startTime}–{s.endTime}</span>
                    {endsNextDay(s.startTime, s.endTime) && <div className="text-xs text-muted">se termine le lendemain</div>}
                  </td>
                  <td className={cn(td, "font-mono tabular")}>{hm(shiftDurationMinutes(s))}</td>
                  <td className={cn(td, "text-[13px]")}>{s.breakMinutes ? `${s.breakMinutes} min · ${s.breakPaid ? "rémunérée" : "non rémunérée"}` : <span className="text-muted">Aucune</span>}</td>
                  <td className={td}>{s.isNight ? <StatusPill tone="info"><Moon className="size-3" /> Nuit</StatusPill> : <span className="text-muted">—</span>}</td>
                  <td className={td}>{cat(s.staffCategoryId)}</td>
                  <td className={td}><Toggle size="sm" checked={s.active} onChange={(v) => toggle(s, v)} /></td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Modifier ${s.name}`}><Pencil /></Button>
                    <Button size="icon-sm" variant="danger-ghost" onClick={() => remove(s)} aria-label={`Supprimer ${s.name}`}><Trash2 /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ShiftModal shift={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </Card>
  );
}

function ShiftModal({ shift, categories, onClose, onSaved }: { shift: Partial<ShiftRow>; categories: RulesData["categories"]; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(shift);
  const [saving, setSaving] = useState(false);
  const valid = !!s.name && !!s.code && !!s.startTime && !!s.endTime;
  const nextDay = s.startTime && s.endTime ? endsNextDay(s.startTime, s.endTime) : false;
  const duration = valid ? shiftDurationMinutes({ startTime: s.startTime!, endTime: s.endTime!, breakMinutes: s.breakMinutes ?? 0, breakPaid: !!s.breakPaid }) : 0;
  async function save() {
    setSaving(true);
    const body = { name: s.name, code: s.code, color: s.color, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes ?? 0, breakPaid: !!s.breakPaid, isNight: !!s.isNight, staffCategoryId: s.staffCategoryId ?? null, active: s.active ?? true };
    try {
      if (s.id) await api(`/api/shift-types/${s.id}`, { method: "PATCH", body });
      else await api("/api/shift-types", { body });
      toast.success(s.id ? "Shift modifié." : "Shift ajouté.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={s.id ? "Modifier le shift" : "Ajouter un shift"} icon={<CalendarClock />} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!valid}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Nom" required htmlFor="sn"><Input id="sn" value={s.name ?? ""} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="ex. Matin" /></Field>
        <Field label="Code" required htmlFor="sc"><Input id="sc" value={s.code ?? ""} maxLength={8} onChange={(e) => setS({ ...s, code: e.target.value.toUpperCase() })} className="font-mono uppercase" placeholder="M" /></Field>
        <Field label="Début" required htmlFor="ss"><Input id="ss" type="time" value={s.startTime} onChange={(e) => setS({ ...s, startTime: e.target.value })} className="font-mono" /></Field>
        <Field label="Fin" required htmlFor="se"><Input id="se" type="time" value={s.endTime} onChange={(e) => setS({ ...s, endTime: e.target.value })} className="font-mono" /></Field>
        <Field label="Pause (minutes)" htmlFor="sb"><Input id="sb" type="number" min={0} max={240} value={s.breakMinutes ?? 0} onChange={(e) => setS({ ...s, breakMinutes: Number(e.target.value) })} /></Field>
        <div className="flex items-end pb-2.5"><Checkbox label="Pause rémunérée" checked={!!s.breakPaid} onChange={(e) => setS({ ...s, breakPaid: e.target.checked })} /></div>
        <Field label="Catégorie" htmlFor="scat" className="sm:col-span-2">
          <Select id="scat" value={s.staffCategoryId ?? ""} onChange={(e) => setS({ ...s, staffCategoryId: e.target.value || null })}>
            <option value="">Toutes</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-[13px] font-medium">Couleur</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur du shift">
            {SHIFT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={s.color === c} aria-label={c} onClick={() => setS({ ...s, color: c })} className={cn("size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-surface transition", s.color === c && "ring-2 ring-text")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2"><Toggle checked={!!s.isNight} onChange={(v) => setS({ ...s, isNight: v })} label="Shift de nuit" description="Utilisé par les règles de nuit (nuits consécutives, repos après une nuit, nuit puis matin)." /></div>
      </div>
      {valid && (
        <div className="mt-5 flex gap-2.5 rounded-[10px] bg-brand-100/60 p-3 text-[13px]">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-500" />
          <span>Amplitude {hm(amplitudeMinutes(s.startTime!, s.endTime!))} · durée payée <b>{hm(duration)}</b>{nextDay ? " · se termine le lendemain" : ""}.</span>
        </div>
      )}
    </Modal>
  );
}
