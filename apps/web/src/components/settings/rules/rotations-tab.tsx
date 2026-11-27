"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Pencil, Plus, Repeat2, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { addDays, startOfIsoWeek } from "@yghr/core";
import { Button, Card, cn, readableText, EmptyState, Field, Input, Modal, Segmented, Select, StatusPill, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import type { RulesData } from "./rules-module";
import { DAY_SHORT, daysLabel, type RotationRow } from "./types";

export function RotationsTab({ rotations, shiftTypes, services, categories, employees, today }: RulesData) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<RotationRow> | null>(null);
  const [assigning, setAssigning] = useState<RotationRow | null>(null);
  const [generating, setGenerating] = useState<RotationRow | null>(null);
  const stName = (id: string) => (id === "REST" ? "Repos" : (shiftTypes.find((s) => s.id === id)?.name ?? "?"));
  const stColor = (id: string) => (id === "REST" ? undefined : shiftTypes.find((s) => s.id === id)?.color);

  async function remove(r: RotationRow) {
    if (!(await confirmDialog({ title: `Supprimer la rotation « ${r.name} » ?`, message: "Les brouillons déjà générés restent dans le planning.", danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/rotations/${r.id}`, { method: "DELETE" });
    toast.success("Rotation supprimée.");
    router.refresh();
  }
  async function removeAssignment(r: RotationRow, id: string) {
    await api(`/api/rotations/${r.id}/assign?assignmentId=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">Une rotation propose un brouillon de planning (créneaux non publiés) : rien n'est publié automatiquement, le responsable RH relit puis publie dans le Planning.</p>
        <Button size="sm" onClick={() => setEditing({ unit: "WEEK", sequence: [], workDays: [1, 2, 3, 4, 5], active: true })}><Plus /> Nouvelle rotation</Button>
      </div>
      {rotations.length === 0 && (
        <Card><EmptyState icon={<Repeat2 />} title="Aucune rotation" action={<Button onClick={() => setEditing({ unit: "WEEK", sequence: [], workDays: [1, 2, 3, 4, 5], active: true })}><Plus /> Nouvelle rotation</Button>}>Créez un cycle (par exemple Matin → Après-midi → Nuit → Repos) pour pré-remplir le planning d'un service.</EmptyState></Card>
      )}
      {rotations.map((r) => (
        <Card key={r.id} className={cn("p-5", !r.active && "opacity-70")}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-semibold">{r.name}</h3>
                <StatusPill tone="brand">Automatique</StatusPill>
                <StatusPill>{r.unit === "WEEK" ? "Semaine" : "Jour"}</StatusPill>
                <StatusPill>{daysLabel(r.workDays)}</StatusPill>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                {r.sequence.map((id, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", id === "REST" ? "bg-surface-2 text-muted" : "")} style={stColor(id) ? { background: stColor(id), color: readableText(stColor(id)!) } : undefined}>{stName(id)}</span>
                    {i < r.sequence.length - 1 && <ArrowRight className="size-3.5 text-muted" />}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle size="sm" checked={r.active} onChange={async (v) => { await api(`/api/rotations/${r.id}`, { method: "PATCH", body: { active: v } }); router.refresh(); }} />
              <Button size="sm" variant="secondary" onClick={() => setAssigning(r)}><UserPlus /> Affecter</Button>
              <Button size="sm" variant="subtle" onClick={() => setGenerating(r)}><Sparkles /> Générer un brouillon</Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label="Modifier"><Pencil /></Button>
              <Button size="icon-sm" variant="danger-ghost" onClick={() => remove(r)} aria-label="Supprimer"><Trash2 /></Button>
            </div>
          </div>
          <div className="mt-4 rounded-[12px] bg-surface-2/70 p-3.5 text-[13px] leading-relaxed text-muted">
            {r.sequence.map((id, i) => `${r.unit === "WEEK" ? "Semaine" : "Jour"} ${i + 1} : ${stName(id)}`).join(" → ")} → le cycle recommence
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Affectations</div>
            {r.assignments.length === 0 ? (
              <p className="text-sm text-muted">Pas encore affectée. Cliquez sur « Affecter » pour choisir un service, une catégorie ou un salarié.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {r.assignments.map((a) => (
                  <li key={a.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-[13px]">
                    {a.label} · du {frDate(a.startDate)} {a.endDate ? `au ${frDate(a.endDate)}` : "(sans fin)"}
                    <button onClick={() => removeAssignment(r, a.id)} className="grid size-6 cursor-pointer place-items-center rounded-full text-muted hover:bg-danger-100 hover:text-danger" aria-label="Retirer l'affectation"><X className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ))}
      {editing && <RotationModal value={editing} shiftTypes={shiftTypes} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {assigning && <AssignModal rotation={assigning} services={services} categories={categories} employees={employees} today={today} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); router.refresh(); }} />}
      {generating && <GenerateModal rotation={generating} today={today} onClose={() => setGenerating(null)} />}
    </div>
  );
}

function RotationModal({ value, shiftTypes, onClose, onSaved }: { value: Partial<RotationRow>; shiftTypes: RulesData["shiftTypes"]; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState(value);
  const [saving, setSaving] = useState(false);
  const seq = r.sequence ?? [];
  async function save() {
    setSaving(true);
    const body = { name: r.name, unit: r.unit, sequence: seq, workDays: r.workDays, active: r.active ?? true };
    try {
      if (r.id) await api(`/api/rotations/${r.id}`, { method: "PATCH", body });
      else await api("/api/rotations", { body });
      toast.success("Rotation enregistrée.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={r.id ? "Modifier la rotation" : "Nouvelle rotation"} icon={<Repeat2 />} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!r.name || !seq.length || !r.workDays?.length}>Enregistrer</Button></>}>
      <div className="space-y-5">
        <Field label="Nom" required htmlFor="rn"><Input id="rn" value={r.name ?? ""} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="ex. Cycle 3×8 Pédiatrie" /></Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Unité du cycle</div>
          <Segmented value={r.unit ?? "WEEK"} onChange={(v) => setR({ ...r, unit: v })} options={[{ value: "WEEK", label: "Une étape par semaine" }, { value: "DAY", label: "Une étape par jour travaillé" }]} />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Jours travaillés</div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = r.workDays?.includes(d);
              return <button key={d} type="button" aria-pressed={on} onClick={() => setR({ ...r, workDays: on ? r.workDays!.filter((x) => x !== d) : [...(r.workDays ?? []), d] })} className={cn("h-9 w-12 cursor-pointer rounded-[10px] border text-sm font-medium transition", on ? "border-brand-500 bg-brand-500 text-white dark:text-brand-900" : "border-border hover:bg-surface-2")}>{DAY_SHORT[d]}</button>;
            })}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Séquence</div>
          <div className="min-h-12 rounded-[12px] border border-dashed border-border p-2.5">
            {seq.length === 0 && <p className="px-1 py-1.5 text-sm text-muted">Ajoutez les étapes du cycle ci-dessous, dans l'ordre.</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              {seq.map((id, i) => {
                const st = shiftTypes.find((s) => s.id === id);
                return (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium", st ? "" : "bg-surface-2")} style={st ? { background: st.color, color: readableText(st.color) } : undefined}>
                      {st?.name ?? "Repos"}
                      <button type="button" onClick={() => setR({ ...r, sequence: seq.filter((_, j) => j !== i) })} className="grid size-4 cursor-pointer place-items-center rounded-full hover:bg-black/15" aria-label="Retirer"><X className="size-3" /></button>
                    </span>
                    {i < seq.length - 1 && <ArrowRight className="size-3 text-muted" />}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shiftTypes.filter((s) => s.active).map((s) => <button key={s.id} type="button" onClick={() => setR({ ...r, sequence: [...seq, s.id] })} className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand-500">+ {s.name}</button>)}
            <button type="button" onClick={() => setR({ ...r, sequence: [...seq, "REST"] })} className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand-500">+ Repos</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({ rotation, services, categories, employees, today, onClose, onSaved }: { rotation: RotationRow; services: RulesData["services"]; categories: RulesData["categories"]; employees: RulesData["employees"]; today: string; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState<"service" | "category" | "employee">("service");
  const [targetId, setTargetId] = useState("");
  const [startDate, setStart] = useState(startOfIsoWeek(today));
  const [endDate, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const opts = target === "service" ? services.map((s) => [s.id, s.name]) : target === "category" ? categories.map((c) => [c.id, c.name]) : employees.map((e) => [e.id, `${e.lastName} ${e.firstName}`]);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/rotations/${rotation.id}/assign`, { body: { target, targetId, startDate, endDate: endDate || null } });
      toast.success("Rotation affectée.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} title={`Affecter « ${rotation.name} »`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!targetId}>Affecter</Button></>}>
      <div className="space-y-4">
        <Segmented value={target} onChange={(v) => { setTarget(v); setTargetId(""); }} options={[{ value: "service", label: "Service" }, { value: "category", label: "Catégorie" }, { value: "employee", label: "Salarié" }]} />
        <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Cible">
          <option value="">Choisir…</option>
          {opts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field label="À partir du" required htmlFor="as"><Input id="as" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Jusqu'au" htmlFor="ae" help="Vide = sans fin"><Input id="ae" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function GenerateModal({ rotation, today, onClose }: { rotation: RotationRow; today: string; onClose: () => void }) {
  const monday = startOfIsoWeek(addDays(today, 7));
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(addDays(monday, 27));
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const r = await api<{ created: number; skippedPublished: number }>(`/api/rotations/${rotation.id}/generate-draft`, { body: { from, to, overwritePublished: overwrite } });
      toast.success(`${r.created} créneau(x) en brouillon créés.${r.skippedPublished ? ` ${r.skippedPublished} cellule(s) déjà publiée(s) conservée(s).` : ""} Relisez puis publiez depuis le Planning.`);
      onClose();
    } catch {}
    setLoading(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} title="Générer un brouillon" subtitle="Les créneaux sont créés en brouillon : rien n'est publié tant que vous ne le décidez pas." icon={<Sparkles />} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={run} loading={loading}>Générer</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du" htmlFor="gf"><Input id="gf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Au" htmlFor="gt"><Input id="gt" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Toggle checked={overwrite} onChange={setOverwrite} label="Remplacer aussi les cellules publiées" description="Désactivé par défaut : les cellules déjà publiées ne sont jamais écrasées sans votre accord." />
      </div>
    </Modal>
  );
}
