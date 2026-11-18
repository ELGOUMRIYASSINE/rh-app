"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Copy, ExternalLink, KeyRound, MapPin, Pencil, Plus, Tablet, Trash2, Users } from "lucide-react";
import { Button, Card, CardHeader, cn, EmptyState, Field, Input, Modal, PageHeader, Select, StatusPill, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";

interface Centre { id: string; name: string; address: string | null; active: boolean; employees: number; services: number }

export function StructureView({ centres }: { centres: Centre[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Centre> | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (edit!.id) await api(`/api/centres/${edit!.id}`, { method: "PATCH", body: { name: edit!.name, address: edit!.address || null } });
      else await api("/api/centres", { body: { name: edit!.name, address: edit!.address || null, active: true } });
      toast.success(edit!.id ? "Centre modifié" : "Centre créé");
      setEdit(null);
      router.refresh();
    } catch {}
    setSaving(false);
  }
  async function remove(c: Centre) {
    if (!(await confirmDialog({ title: `Supprimer « ${c.name} » ?`, message: c.employees ? `${c.employees} salarié(s) ne seront plus rattachés à un centre.` : undefined, danger: true, confirmLabel: "Supprimer" }))) return;
    await api(`/api/centres/${c.id}`, { method: "DELETE" });
    toast.success("Centre supprimé");
    router.refresh();
  }
  return (
    <div>
      <PageHeader title="Gestion de la structure" subtitle="Centres et sites de l'organisation. Les services et les salariés se rattachent à un centre." actions={<Button onClick={() => setEdit({})}><Plus /> Nouveau centre</Button>} />
      {centres.length === 0 ? <Card><EmptyState icon={<Building2 />} title="Aucun centre" action={<Button onClick={() => setEdit({})}><Plus /> Nouveau centre</Button>}>Ajoutez vos sites (ex. Centre Bollène) pour filtrer listes, planning et rapports par centre.</EmptyState></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {centres.map((c) => (
            <Card key={c.id} className={cn("p-5", !c.active && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="grid size-11 place-items-center rounded-[12px] bg-brand-100 text-brand-700 dark:text-brand-400"><Building2 className="size-5" /></div>
                <div className="min-w-0 flex-1"><div className="font-semibold">{c.name}</div><div className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" />{c.address ?? "Adresse non renseignée"}</div></div>
                <Toggle size="sm" checked={c.active} onChange={async (v) => { await api(`/api/centres/${c.id}`, { method: "PATCH", body: { active: v } }); toast.success("Centre modifié"); router.refresh(); }} />
              </div>
              <div className="mt-4 flex gap-4 text-sm"><span className="inline-flex items-center gap-1.5"><Users className="size-4 text-muted" />{c.employees} salarié(s)</span><span className="text-muted">{c.services} service(s)</span></div>
              <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEdit(c)}><Pencil /> Modifier</Button><Button size="sm" variant="danger-ghost" onClick={() => remove(c)}><Trash2 /> Supprimer</Button></div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} size="sm" icon={<Building2 />} title={edit?.id ? "Modifier le centre" : "Nouveau centre"} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Annuler</Button><Button onClick={save} loading={saving} disabled={!edit?.name || edit.name.length < 2}>Enregistrer</Button></>}>
        <div className="space-y-4">
          <Field label="Nom" required htmlFor="cn"><Input id="cn" value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="ex. Centre Bollène" /></Field>
          <Field label="Adresse" htmlFor="ca"><Input id="ca" value={edit?.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

interface TabletRow { id: string; name: string; token: string; active: boolean; centreId: string | null; centre: { name: string } | null; lastSeenAt: string | null }
interface Rules { allowedIps: string[]; photoRequired: boolean; geofence: { lat: number; lng: number; radiusMeters: number } | null }

export function TabletsView({ tablets, centres, employees, rules: initialRules, slug, origin }: { tablets: TabletRow[]; centres: { id: string; name: string }[]; employees: { id: string; name: string; hasPin: boolean }[]; rules: Rules; slug: string; origin: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [centreId, setCentreId] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [ips, setIps] = useState(initialRules.allowedIps.join(", "));
  const [pinFor, setPinFor] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState("");
  const kioskUrl = (t: TabletRow) => `${origin}/${slug}/kiosk/${t.token}`;
  async function add() {
    await api("/api/tablets", { body: { name, centreId: centreId || null, active: true } });
    toast.success("Tablette enregistrée. Ouvrez son lien sur la tablette pour la transformer en borne.");
    setName(""); router.refresh();
  }
  async function saveRules() {
    const allowedIps = ips.split(/[\s,;]+/).filter(Boolean);
    await api("/api/organization/tablet-rules", { method: "PUT", body: { ...rules, allowedIps } });
    toast.success("Règles des tablettes enregistrées.");
  }
  async function savePin() {
    await api(`/api/employees/${pinFor!.id}/pin`, { method: "PUT", body: { pin: pin || null } });
    toast.success(pin ? `Code borne défini pour ${pinFor!.name}.` : "Code borne supprimé.");
    setPinFor(null); setPin(""); router.refresh();
  }
  return (
    <div>
      <PageHeader title="Tablettes de pointage" subtitle="Transformez une tablette en borne : les salariés pointent avec leur code personnel." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<Tablet />} title="Tablettes enregistrées" />
            <div className="flex flex-wrap items-end gap-2 px-5 pb-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. Tablette accueil)" className="w-56" aria-label="Nom" />
              <Select value={centreId} onChange={(e) => setCentreId(e.target.value)} className="w-48" aria-label="Centre"><option value="">Tous centres</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Button onClick={add} disabled={name.trim().length < 2}><Plus /> Ajouter</Button>
            </div>
            <ul className="divide-y divide-border">
              {tablets.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1"><div className="font-medium">{t.name}</div><div className="text-xs text-muted">{t.centre?.name ?? "Tous centres"} · {t.lastSeenAt ? `dernier pointage ${new Date(t.lastSeenAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "jamais utilisée"}</div></div>
                  <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(kioskUrl(t)); toast.success("Lien de la borne copié."); }}><Copy /> Lien</Button>
                  <a href={kioskUrl(t)} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-[10px] text-muted hover:bg-surface-2" aria-label="Ouvrir la borne"><ExternalLink className="size-4" /></a>
                  <Toggle size="sm" checked={t.active} onChange={async (v) => { await api(`/api/tablets/${t.id}`, { method: "PATCH", body: { active: v } }); router.refresh(); }} />
                  <Button size="icon-sm" variant="danger-ghost" aria-label="Supprimer" onClick={async () => { if (await confirmDialog({ title: `Supprimer « ${t.name} » ?`, danger: true, confirmLabel: "Supprimer" })) { await api(`/api/tablets/${t.id}`, { method: "DELETE" }); router.refresh(); } }}><Trash2 /></Button>
                </li>
              ))}
              {!tablets.length && <li className="px-5 py-8 text-center text-sm text-muted">Aucune tablette. Ajoutez-en une puis ouvrez son lien sur l'appareil.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader icon={<KeyRound />} title="Codes borne (PIN)" subtitle="Chaque salarié pointe avec un code de 4 à 6 chiffres, stocké chiffré." />
            <ul className="scrollbar-thin grid max-h-[420px] gap-1 overflow-y-auto px-3 pb-4 sm:grid-cols-2">
              {employees.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                  <span className="truncate text-sm">{e.name}</span>
                  <button onClick={() => { setPinFor(e); setPin(""); }} className="cursor-pointer">{e.hasPin ? <StatusPill tone="success">Défini</StatusPill> : <StatusPill>Définir</StatusPill>}</button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Règles des tablettes" subtitle="S'appliquent à toutes les bornes de l'organisation." />
          <div className="space-y-5 px-5 pb-5">
            <Field label="Réseaux autorisés (IP)" help="Séparés par des virgules, ex. 192.168.1.* ou 41.250.10.12. Vide = partout."><Input value={ips} onChange={(e) => setIps(e.target.value)} className="font-mono" /></Field>
            <Toggle checked={rules.photoRequired} onChange={(v) => setRules({ ...rules, photoRequired: v })} label="Photo obligatoire" description="Un selfie est pris à chaque pointage." />
            <Toggle checked={!!rules.geofence} onChange={(v) => setRules({ ...rules, geofence: v ? { lat: 33.5731, lng: -7.5898, radiusMeters: 200 } : null })} label="Zone géographique" description="Refuse les pointages hors d'un rayon autour du site." />
            {rules.geofence && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Latitude"><Input value={rules.geofence.lat} onChange={(e) => setRules({ ...rules, geofence: { ...rules.geofence!, lat: Number(e.target.value) } })} className="font-mono" /></Field>
                <Field label="Longitude"><Input value={rules.geofence.lng} onChange={(e) => setRules({ ...rules, geofence: { ...rules.geofence!, lng: Number(e.target.value) } })} className="font-mono" /></Field>
                <Field label="Rayon (m)"><Input value={rules.geofence.radiusMeters} onChange={(e) => setRules({ ...rules, geofence: { ...rules.geofence!, radiusMeters: Number(e.target.value) } })} className="font-mono" /></Field>
              </div>
            )}
            <Button onClick={saveRules}>Enregistrer les règles</Button>
          </div>
        </Card>
      </div>
      <Modal open={!!pinFor} onOpenChange={(o) => !o && setPinFor(null)} size="sm" icon={<KeyRound />} title={`Code borne — ${pinFor?.name ?? ""}`} subtitle="Communiquez ce code au salarié. Laissez vide pour le supprimer." footer={<><Button variant="ghost" onClick={() => setPinFor(null)}>Annuler</Button><Button onClick={savePin} disabled={!!pin && !/^\d{4,6}$/.test(pin)}>Enregistrer</Button></>}>
        <Input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 à 6 chiffres" className="h-12 text-center font-mono text-xl tracking-[0.4em]" aria-label="Code borne" />
      </Modal>
    </div>
  );
}
