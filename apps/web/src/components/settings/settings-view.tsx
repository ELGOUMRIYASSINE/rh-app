"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Building2, ChevronRight, ImagePlus, KeyRound, MoonStar, Scale, ShieldCheck, Trash2 } from "lucide-react";
import { useRef } from "react";
import { YGHRLogo } from "@yghr/ui";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PasswordStrength } from "@/components/password-strength";
import { PushToggle } from "@/components/push-toggle";

type Org = {
  name: string; slug: string; contactEmail: string; accountingEmail: string; address: string; phone: string; ice: string; cnssEmployerNumber: string; logoUrl: string | null; language: string; currency: string; timezone: string;
  nightStart: string; nightEnd: string; weeklyRestDay: number | null; useServerTimeForPunches: boolean; require2FAForAdmins: boolean; dailyEmails: boolean; persistentSessions: boolean;
};
const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const TIMEZONES = ["Africa/Casablanca", "Europe/Paris", "Africa/Algiers", "Africa/Tunis", "Africa/Dakar", "UTC"];

export function SettingsView({ org, base, counts }: { org: Org; base: string; counts: { rules: number; shifts: number } }) {
  const router = useRouter();
  const [o, setO] = useState(org);
  const [saving, setSaving] = useState<string | null>(null);
  const set = <K extends keyof Org>(k: K, v: Org[K]) => setO((p) => ({ ...p, [k]: v }));

  async function save(section: string, keys: (keyof Org)[], message = "Modifications enregistrées.") {
    setSaving(section);
    try {
      await api("/api/organization", { method: "PATCH", body: Object.fromEntries(keys.map((k) => [k, o[k]])) });
      toast.success(message);
      router.refresh();
    } catch {}
    setSaving(null);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Paramètres" subtitle="Configuration de l'application et préférences" />
      <div className="space-y-5">
        <Card>
          <CardHeader icon={<Building2 />} title="Identité de l'établissement" subtitle="Nom, coordonnées et logo affichés dans l'application et imprimés sur les bulletins de paie, le planning et les documents signés." />
          <div className="grid gap-6 px-5 pb-5 lg:grid-cols-[1fr_300px]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Nom de l'établissement" htmlFor="name" required help="Ex. « Clinique Al Amal ». Il apparaît en haut de l'application et sur tous les documents."><Input id="name" value={o.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field className="sm:col-span-2" label="Adresse" htmlFor="addr"><Input id="addr" value={o.address} onChange={(e) => set("address", e.target.value)} placeholder="12 bd Zerktouni, 20000 Casablanca" /></Field>
              <Field label="Téléphone" htmlFor="tel"><Input id="tel" value={o.phone} onChange={(e) => set("phone", e.target.value)} placeholder="05 22 00 00 00" /></Field>
              <Field label="Email de contact (général)" htmlFor="ce"><Input id="ce" type="email" value={o.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="contact@clinique.ma" /></Field>
              <Field label="ICE" htmlFor="ice" help="Identifiant commun de l'entreprise (15 chiffres)."><Input id="ice" inputMode="numeric" value={o.ice} onChange={(e) => set("ice", e.target.value.replace(/\D/g, ""))} className="font-mono" maxLength={15} /></Field>
              <Field label="N° d'affiliation CNSS" htmlFor="cnss" help="Obligatoire sur les bulletins de paie."><Input id="cnss" inputMode="numeric" value={o.cnssEmployerNumber} onChange={(e) => set("cnssEmployerNumber", e.target.value.replace(/\D/g, ""))} className="font-mono" maxLength={10} /></Field>
            </div>
            <LogoCard logoUrl={o.logoUrl} name={o.name} legal={[o.address, o.phone, o.ice && `ICE ${o.ice}`, o.cnssEmployerNumber && `CNSS ${o.cnssEmployerNumber}`].filter(Boolean).join(" · ")} onChange={(url) => { set("logoUrl", url); router.refresh(); }} />
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button loading={saving === "identity"} disabled={o.name.trim().length < 2} onClick={() => save("identity", ["name", "address", "phone", "contactEmail", "ice", "cnssEmployerNumber"], "Identité enregistrée : elle s'applique dès maintenant à l'application et aux nouveaux documents.")}>Enregistrer</Button>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Building2 />} title="Informations de l'entreprise" subtitle="Identifiant, langue, devise et fuseau horaire." />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Identifiant (tenant)" htmlFor="slug" help="Utilisé dans les adresses. Il ne peut pas être modifié."><Input id="slug" value={o.slug} readOnly disabled className="font-mono" /></Field>
            <Field label="Email service comptabilité (acomptes)" htmlFor="ae" help="Reçoit les acomptes approuvés."><Input id="ae" type="email" value={o.accountingEmail} onChange={(e) => set("accountingEmail", e.target.value)} placeholder="compta@clinique.ma" /></Field>
            <Field label="Langue principale" htmlFor="lang">
              <Select id="lang" value={o.language} onChange={(e) => set("language", e.target.value)}>
                <option value="fr">Français</option>
                <option value="ar">العربية (bientôt)</option>
                <option value="en">English (bientôt)</option>
              </Select>
            </Field>
            <Field label="Devise" htmlFor="cur">
              <Select id="cur" value={o.currency} onChange={(e) => set("currency", e.target.value)}>
                <option value="MAD">Dirham marocain (DH)</option>
                <option value="EUR">Euro (EUR)</option>
              </Select>
            </Field>
            <Field label="Fuseau horaire" htmlFor="tz" help="Tous les calculs (présences, nuit, paie) se font dans ce fuseau.">
              <Select id="tz" value={o.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button loading={saving === "info"} onClick={() => save("info", ["accountingEmail", "language", "currency", "timezone"])}>Enregistrer</Button>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<MoonStar />} title="Configuration des heures de nuit" subtitle="Plage horaire de nuit générale et repos hebdomadaire." />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
            <Field label="Début" htmlFor="ns"><Input id="ns" type="time" value={o.nightStart} onChange={(e) => set("nightStart", e.target.value)} className="font-mono" /></Field>
            <Field label="Fin" htmlFor="ne"><Input id="ne" type="time" value={o.nightEnd} onChange={(e) => set("nightEnd", e.target.value)} className="font-mono" /></Field>
            <div className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted sm:self-end">Par défaut 21:00 → 06:00 : la plage de nuit légale au Maroc. Elle sert au calcul des heures de nuit et de leurs majorations.</div>
            <Field className="sm:col-span-3" label="Jour de repos hebdomadaire" htmlFor="rest" help="Jour de repos légal (art. 205). Utilisé par la paie pour majorer les heures travaillées ce jour-là.">
              <Select id="rest" value={o.weeklyRestDay ?? ""} onChange={(e) => set("weeklyRestDay", e.target.value === "" ? null : Number(e.target.value))} className="sm:max-w-xs">
                <option value="">Non configuré</option>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button loading={saving === "night"} onClick={() => save("night", ["nightStart", "nightEnd", "weeklyRestDay"])}>Enregistrer</Button>
          </div>
        </Card>

        <Link href={`${base}/settings/regles-shifts`} className="group block">
          <Card className="flex items-center gap-4 p-5 transition-shadow group-hover:shadow-pop">
            <div className="grid size-11 place-items-center rounded-[12px] bg-brand-100 text-brand-700 dark:text-brand-400"><Scale className="size-5" strokeWidth={1.75} /></div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold">Règles de travail</h3>
              <p className="mt-0.5 text-[13px] text-muted">Règles des shifts, types de shifts, catégories, rotations, couverture et anomalies · {counts.rules} règles actives · {counts.shifts} shifts</p>
            </div>
            <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" />
          </Card>
        </Link>

        <Card>
          <CardHeader icon={<Bell />} title="Notifications" />
          <div className="space-y-5 px-5 pb-5">
            <PushToggle />
            <Toggle checked={o.dailyEmails} onChange={(v) => { set("dailyEmails", v); void api("/api/organization", { method: "PATCH", body: { dailyEmails: v } }).then(() => toast.success(v ? "Résumé quotidien activé." : "Résumé quotidien désactivé.")); }} label="Emails quotidiens" description="Chaque matin, un résumé des présences de la veille et des congés en attente." />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck />} title="Sécurité" />
          <div className="space-y-5 px-5 pb-5">
            <Toggle checked={o.require2FAForAdmins} onChange={(v) => { set("require2FAForAdmins", v); void api("/api/organization", { method: "PATCH", body: { require2FAForAdmins: v } }).then(() => toast.success("Préférence enregistrée.")); }} label="Authentification forte (2FA)" description="Exiger la double authentification pour les responsables RH. Activez-la pour vous dans Mon profil." />
            <Toggle checked={o.persistentSessions} onChange={(v) => { set("persistentSessions", v); void api("/api/organization", { method: "PATCH", body: { persistentSessions: v } }).then(() => toast.success("Préférence enregistrée.")); }} label="Session persistante" description="Garder la session ouverte 30 jours. Désactivé : déconnexion après 12 heures." />
            <Toggle checked={o.useServerTimeForPunches} onChange={(v) => { set("useServerTimeForPunches", v); void api("/api/organization", { method: "PATCH", body: { useServerTimeForPunches: v } }).then(() => toast.success("Préférence enregistrée.")); }} label="Utiliser l'heure du serveur pour les pointages" description="Pour les pointeuses dont l'horloge dérive." />
          </div>
        </Card>

        <PasswordCard />
      </div>
    </div>
  );
}

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ message: string }>("/api/users/change-password", { body: { current, next, confirm } });
      toast.success(r.message);
      setCurrent(""); setNext(""); setConfirm("");
    } catch {}
    setLoading(false);
  }
  return (
    <Card>
      <CardHeader icon={<KeyRound />} title="Changement de mot de passe" />
      <form onSubmit={submit}>
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
          <Field label="Mot de passe actuel" htmlFor="pc"><Input id="pc" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="Nouveau" htmlFor="pn"><Input id="pn" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Confirmer" htmlFor="pf" error={confirm && confirm !== next ? "Ne correspond pas" : null}><Input id="pf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!confirm && confirm !== next} /></Field>
          <div className="sm:col-span-3"><PasswordStrength value={next} /></div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button type="submit" loading={loading} disabled={!current || !next || next !== confirm}>Modifier le mot de passe</Button>
        </div>
      </form>
    </Card>
  );
}

function LogoCard({ logoUrl, name, legal, onChange }: { logoUrl: string | null; name: string; legal: string; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const form = new FormData();
    form.append("logo", f);
    try {
      const r = await api<{ logoUrl: string }>("/api/organization/logo", { form });
      toast.success("Logo enregistré.");
      onChange(r.logoUrl);
    } catch {}
    setBusy(false);
  }
  async function remove() {
    await api("/api/organization/logo", { method: "DELETE" });
    toast.success("Logo retiré.");
    onChange(null);
  }
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium">Logo</div>
      <div className="flex items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-border bg-white">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-1.5" /> : <ImagePlus className="size-6 text-muted" />}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={busy}><ImagePlus /> {logoUrl ? "Changer" : "Ajouter un logo"}</Button>
          {logoUrl && <Button size="sm" variant="danger-ghost" onClick={remove}><Trash2 /> Retirer</Button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      <p className="mt-2 text-xs text-muted">PNG ou JPG, 1 Mo maximum. Fond transparent conseillé.</p>
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Aperçu en-tête des documents</div>
      <div className="mt-1.5 flex items-center gap-3 rounded-[10px] bg-brand-900 p-3 text-white">
        {logoUrl ? <img src={logoUrl} alt="" className="size-9 rounded-md bg-white object-contain p-0.5" /> : <YGHRLogo variant="mark" size={36} />}
        <div className="min-w-0"><div className="truncate text-sm font-bold">{name || "Nom de l'établissement"}</div><div className="truncate text-[10px] opacity-70">{legal || "Adresse · Téléphone · ICE · CNSS"}</div></div>
      </div>
    </div>
  );
}
