"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Copy, Info, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { formatRuleValue, RULE_TYPE_META, WORK_RULE_TYPES, type WorkRuleType } from "@yghr/core";
import { Button, Card, CardHeader, cn, EmptyState, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, SectionLabel, Select, SeverityBadge, StatusPill, td, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import type { RulesData } from "./rules-module";
import type { RuleRow } from "./types";

const GROUPS = ["Durée de travail", "Temps de repos", "Règles de nuit", "Heures supplémentaires", "Pointage réel"] as const;

export function RulesTab({ rules, categories }: RulesData) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<RuleRow> | null>(null);
  const catName = (id: string | null) => (id ? (categories.find((c) => c.id === id)?.name ?? "—") : "Toutes");
  const list = useMemo(() => rules.filter((r) => filter === "all" || RULE_TYPE_META[r.type].group === filter).sort((a, b) => GROUPS.indexOf(RULE_TYPE_META[a.type].group) - GROUPS.indexOf(RULE_TYPE_META[b.type].group)), [rules, filter]);

  async function toggle(r: RuleRow, active: boolean) {
    await api(`/api/work-rules/${r.id}`, { method: "PATCH", body: { active } });
    toast.success(active ? "Règle activée." : "Règle désactivée.");
    router.refresh();
  }
  async function remove(r: RuleRow) {
    if (!(await confirmDialog({ title: `Supprimer la règle « ${RULE_TYPE_META[r.type].label} » ?`, danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/work-rules/${r.id}`, { method: "DELETE" });
    toast.success("Règle supprimée.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-[12px] border border-info/25 bg-info-100/60 p-4 text-[13px] leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>Valeurs définies par l'établissement. Les valeurs sont configurables par l'établissement et ne constituent pas une validation juridique ; confirmez-les selon votre pays, secteur et convention. Les taux de majoration des heures supplémentaires restent ceux de la Paie.</p>
      </div>
      <Card>
        <CardHeader
          title="Règles configurées"
          subtitle="Une règle n'est appliquée que si elle est active. Une règle propre à une catégorie de personnel est prioritaire sur la règle générale de même type."
          actions={
            <>
              <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 w-auto" aria-label="Filtrer les règles">
                <option value="all">Toutes les règles</option>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Button size="sm" onClick={() => setEditing({ severity: "WARNING", exceptionAllowed: true, active: true, staffCategoryId: null })}><Plus /> Ajouter une règle</Button>
            </>
          }
        />
        {list.length === 0 ? (
          <EmptyState icon={<Scale />} title="Aucune règle" action={<Button onClick={() => setEditing({ severity: "WARNING", exceptionAllowed: true, active: true, staffCategoryId: null })}><Plus /> Ajouter une règle</Button>}>Ajoutez une première règle : le planning signalera automatiquement ce qui ne la respecte pas.</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr>
                  {["Catégorie concernée", "Type de règle", "Valeur", "Gravité", "Exception autorisée", "Statut", "Dernière modification", ""].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-surface-2/50", !r.active && "opacity-60")}>
                    <td className={td}>{r.staffCategoryId ? <StatusPill tone="brand">{catName(r.staffCategoryId)}</StatusPill> : <span className="text-muted">Toutes</span>}</td>
                    <td className={cn(td, "min-w-[240px]")}>
                      <div className="font-medium">{RULE_TYPE_META[r.type].label}</div>
                      <div className="text-xs text-muted">{RULE_TYPE_META[r.type].group}</div>
                    </td>
                    <td className={cn(td, "font-mono tabular")}>{formatRuleValue(r.type, r.value, r.boolValue)}</td>
                    <td className={td}><SeverityBadge severity={r.severity} /></td>
                    <td className={td}>{r.exceptionAllowed ? "Oui" : "Non"}</td>
                    <td className={td}><Toggle size="sm" checked={r.active} onChange={(v) => toggle(r, v)} /></td>
                    <td className={cn(td, "text-xs text-muted")}>
                      {frDate(r.updatedAt)}
                      {r.updatedBy && <div>{r.updatedBy.firstName} {r.updatedBy.lastName}</div>}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <Menu>
                        <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Actions"><MoreHorizontal /></Button></MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<Pencil />} onSelect={() => setEditing(r)}>Modifier</MenuItem>
                          <MenuItem icon={<Copy />} onSelect={() => setEditing({ ...r, id: undefined })}>Dupliquer</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onSelect={() => remove(r)}>Supprimer</MenuItem>
                        </MenuContent>
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <RuleModal rule={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function RuleModal({ rule, categories, onClose, onSaved }: { rule: Partial<RuleRow>; categories: RulesData["categories"]; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState<Partial<RuleRow>>(rule);
  const [saving, setSaving] = useState(false);
  const meta = r.type ? RULE_TYPE_META[r.type] : null;
  async function save() {
    if (!r.type) return toast.error("Choisissez un type de règle.");
    setSaving(true);
    const body = { type: r.type, staffCategoryId: r.staffCategoryId ?? null, value: meta?.unit === "bool" ? null : r.value, boolValue: meta?.unit === "bool" ? (r.boolValue ?? true) : null, severity: r.severity, exceptionAllowed: r.exceptionAllowed, active: r.active };
    try {
      if (r.id) await api(`/api/work-rules/${r.id}`, { method: "PATCH", body });
      else await api("/api/work-rules", { body });
      toast.success(r.id ? "Règle modifiée." : "Règle ajoutée.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  const unitLabel = meta ? { h: "heures", min: "minutes", jour: "jours", nombre: "", bool: "" }[meta.unit] : "";
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={r.id ? "Modifier la règle" : "Ajouter une règle"}
      subtitle="Les exemples ne sont qu'une aide à la saisie : la valeur est celle décidée par l'établissement."
      icon={<Scale />}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>{r.id ? "Enregistrer" : "Ajouter la règle"}</Button></>}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <SectionLabel n={1}>Informations générales</SectionLabel>
          <Field label="Type de règle" required htmlFor="rt" help={meta?.description}>
            <Select id="rt" value={r.type ?? ""} onChange={(e) => { const t = e.target.value as WorkRuleType; setR({ ...r, type: t, value: RULE_TYPE_META[t].unit === "bool" ? null : (RULE_TYPE_META[t].examples[0] as number), boolValue: RULE_TYPE_META[t].unit === "bool" ? true : null }); }}>
              <option value="" disabled>Choisir…</option>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {WORK_RULE_TYPES.filter((t) => RULE_TYPE_META[t].group === g).map((t) => <option key={t} value={t}>{RULE_TYPE_META[t].label}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
        </section>
        <section className="space-y-3">
          <SectionLabel n={2}>Catégorie de personnel</SectionLabel>
          <Field label="Catégorie concernée" required htmlFor="rc" help="Une règle propre à une catégorie est prioritaire sur la règle « Toutes catégories » du même type.">
            <Select id="rc" value={r.staffCategoryId ?? ""} onChange={(e) => setR({ ...r, staffCategoryId: e.target.value || null })}>
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </section>
        <section className="space-y-3">
          <SectionLabel n={3}>Valeur</SectionLabel>
          {!meta ? (
            <p className="text-sm text-muted">Choisissez d'abord un type de règle.</p>
          ) : meta.unit === "bool" ? (
            <Toggle checked={r.boolValue ?? true} onChange={(v) => setR({ ...r, boolValue: v })} label={r.boolValue === false ? "Non" : "Oui"} description="Active ou désactive ce contrôle." />
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <Input type="number" min={0} step={meta.unit === "h" ? 0.5 : 1} value={r.value ?? ""} onChange={(e) => setR({ ...r, value: e.target.value === "" ? null : Number(e.target.value) })} className="w-36 font-mono" aria-label="Valeur" />
                <span className="text-sm text-muted">{unitLabel}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="text-xs text-muted">Exemples :</span>
                {meta.examples.map((ex) => (
                  <button key={String(ex)} type="button" onClick={() => setR({ ...r, value: ex as number })} className="cursor-pointer rounded-full border border-border px-2.5 py-0.5 text-xs hover:border-brand-500 hover:text-brand-500">
                    {formatRuleValue(r.type!, ex as number, null)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="space-y-3">
          <SectionLabel n={4}>Validation et exceptions</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["WARNING", "BLOCKING"] as const).map((sev) => (
              <button key={sev} type="button" onClick={() => setR({ ...r, severity: sev })} className={cn("cursor-pointer rounded-[12px] border p-3.5 text-left transition", r.severity === sev ? "border-brand-500 ring-3 ring-brand-500/15" : "border-border hover:bg-surface-2")}>
                <SeverityBadge severity={sev} />
                <p className="mt-2 text-xs leading-relaxed text-muted">{sev === "BLOCKING" ? "Empêche la publication du planning tant qu'elle n'est pas corrigée ou couverte par une exception." : "Signale le problème sans bloquer la publication."}</p>
              </button>
            ))}
          </div>
          <Toggle checked={r.exceptionAllowed ?? true} onChange={(v) => setR({ ...r, exceptionAllowed: v })} label="Exception autorisée" description="Le responsable peut lever l'anomalie avec une justification écrite." />
          <Toggle checked={r.active ?? true} onChange={(v) => setR({ ...r, active: v })} label="Règle active" />
        </section>
      </div>
    </Modal>
  );
}
