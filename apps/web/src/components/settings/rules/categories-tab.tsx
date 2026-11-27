"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building, Pencil, Plus, Trash2, Users2 } from "lucide-react";
import { Button, Card, CardHeader, cn, Field, Input, Modal, td, th, Textarea, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";
import type { RulesData } from "./rules-module";
import type { CategoryRow, ServiceRow } from "./types";

export function CategoriesTab({ categories, services }: RulesData) {
  const router = useRouter();
  const [cat, setCat] = useState<Partial<CategoryRow> | null>(null);
  const [svc, setSvc] = useState<Partial<ServiceRow> | null>(null);
  async function removeCat(c: CategoryRow) {
    if (!(await confirmDialog({ title: `Supprimer la catégorie « ${c.name} » ?`, message: c.count ? `${c.count} salarié(s) n'auront plus de catégorie. Les règles propres à cette catégorie seront supprimées.` : undefined, danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/staff-categories/${c.id}`, { method: "DELETE" });
    toast.success("Catégorie supprimée.");
    router.refresh();
  }
  async function removeSvc(s: ServiceRow) {
    if (!(await confirmDialog({ title: `Supprimer le service « ${s.name} » ?`, message: s.count ? `${s.count} salarié(s) n'auront plus de service.` : undefined, danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/services/${s.id}`, { method: "DELETE" });
    toast.success("Service supprimé.");
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Catégories de personnel" subtitle="La catégorie de personnel s'attribue dans la fiche du salarié. Les règles, les types de shifts et la couverture peuvent ensuite viser une catégorie précise." actions={<Button size="sm" onClick={() => setCat({ active: true })}><Plus /> Ajouter</Button>} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr>{["Catégorie", "Code", "Description", "Salariés", "Active", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={cn("hover:bg-surface-2/50", !c.active && "opacity-60")}>
                  <td className={cn(td, "font-medium")}>{c.name}</td>
                  <td className={cn(td, "font-mono text-xs")}>{c.code}</td>
                  <td className={cn(td, "max-w-xs text-[13px] text-muted")}>{c.description ?? ""}</td>
                  <td className={cn(td, "tabular")}>{c.count}</td>
                  <td className={td}><Toggle size="sm" checked={c.active} onChange={async (v) => { await api(`/api/staff-categories/${c.id}`, { method: "PATCH", body: { active: v } }); router.refresh(); }} /></td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button size="icon-sm" variant="ghost" onClick={() => setCat(c)} aria-label="Modifier"><Pencil /></Button>
                    <Button size="icon-sm" variant="danger-ghost" onClick={() => removeCat(c)} aria-label="Supprimer"><Trash2 /></Button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Aucune catégorie. Ajoutez par exemple « Infirmières » ou « Personnel administratif ».</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Building />} title="Services" subtitle="Urgences, Pédiatrie, Bloc opératoire, Administration… Utilisés par la couverture du personnel et les rotations ; le service s'attribue dans la fiche du salarié." actions={<Button size="sm" onClick={() => setSvc({ active: true })}><Plus /> Ajouter</Button>} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <div key={s.id} className={cn("group flex items-center gap-3 rounded-[12px] border border-border p-3.5", !s.active && "opacity-60")}>
              <div className="grid size-9 place-items-center rounded-[10px] bg-brand-100 text-brand-700 dark:text-brand-400"><Users2 className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted">{s.count} salarié{s.count > 1 ? "s" : ""}</div>
              </div>
              <div className="flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <Button size="icon-sm" variant="ghost" onClick={() => setSvc(s)} aria-label={`Modifier ${s.name}`}><Pencil /></Button>
                <Button size="icon-sm" variant="danger-ghost" onClick={() => removeSvc(s)} aria-label={`Supprimer ${s.name}`}><Trash2 /></Button>
              </div>
            </div>
          ))}
          {services.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted">Aucun service pour l'instant.</p>}
        </div>
      </Card>

      {cat && <CategoryModal value={cat} onClose={() => setCat(null)} onSaved={() => { setCat(null); router.refresh(); }} />}
      {svc && <ServiceModal value={svc} onClose={() => setSvc(null)} onSaved={() => { setSvc(null); router.refresh(); }} />}
    </div>
  );
}

function CategoryModal({ value, onClose, onSaved }: { value: Partial<CategoryRow>; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState(value);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const body = { name: c.name, code: c.code, description: c.description || null, active: c.active ?? true };
    try {
      if (c.id) await api(`/api/staff-categories/${c.id}`, { method: "PATCH", body });
      else await api("/api/staff-categories", { body });
      toast.success("Catégorie enregistrée.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} title={c.id ? "Modifier la catégorie" : "Nouvelle catégorie"} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!c.name || !c.code}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Nom" required htmlFor="cn"><Input id="cn" value={c.name ?? ""} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="ex. Infirmières" /></Field>
          <Field label="Code" required htmlFor="cc"><Input id="cc" value={c.code ?? ""} maxLength={8} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} className="font-mono" placeholder="INF" /></Field>
        </div>
        <Field label="Description" htmlFor="cd"><Textarea id="cd" rows={2} value={c.description ?? ""} onChange={(e) => setC({ ...c, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function ServiceModal({ value, onClose, onSaved }: { value: Partial<ServiceRow>; onClose: () => void; onSaved: (s: { id: string; name: string }) => void }) {
  const [name, setName] = useState(value.name ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const r = value.id ? await api<{ item: { id: string; name: string } }>(`/api/services/${value.id}`, { method: "PATCH", body: { name } }) : await api<{ item: { id: string; name: string } }>("/api/services", { body: { name, active: true } });
      toast.success("Service enregistré.");
      onSaved(r.item);
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} title={value.id ? "Modifier le service" : "Nouveau service"} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving} disabled={!name.trim()}>Enregistrer</Button></>}>
      <Field label="Nom du service" required htmlFor="svn"><Input id="svn" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Urgences" onKeyDown={(e) => e.key === "Enter" && name.trim() && save()} /></Field>
    </Modal>
  );
}
