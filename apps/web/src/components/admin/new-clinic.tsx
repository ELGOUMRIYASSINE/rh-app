"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Building2, Check, Copy, FlaskConical, Mail, Sparkles, UserCog } from "lucide-react";
import { Button, Card, Checkbox, cn, Field, Input, PageHeader, SectionLabel, Select } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LinkButton } from "./bits";
import { PLANS } from "./fmt";

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

interface Result { id: string; slug: string; inviteUrl: string | null; emailSent: boolean; existingAccount: boolean; email: string }

export function NewClinic() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState("Entreprise");
  const [kind, setKind] = useState<"client" | "demo">("client");
  const [trialDays, setTrialDays] = useState("30");
  const [demoData, setDemoData] = useState(true);
  const [admin, setAdmin] = useState({ firstName: "", lastName: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Result | null>(null);

  const finalSlug = slugTouched ? slug : slugify(name);
  const valid = name.trim().length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalSlug) && admin.firstName.trim() && admin.lastName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email.trim());

  async function submit() {
    setBusy(true);
    try {
      const r = await api<Result>("/api/admin/organizations", { body: { name: name.trim(), slug: finalSlug, planName: plan, kind, trialDays: Number(trialDays) || 30, demoData: kind === "demo" ? demoData : false, admin } });
      setDone(r);
      toast.success(`« ${name.trim()} » est créée.`);
    } catch {}
    setBusy(false);
  }

  if (done) return <Created r={done} name={name.trim()} demo={kind === "demo" && demoData} />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/cliniques" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Cliniques</Link>
      <PageHeader title="Nouvelle clinique" subtitle="Créez l'espace d'un nouveau client et le compte RH qui le gérera." />
      <Card className="space-y-8 p-6">
        <section className="space-y-4">
          <SectionLabel n={1}>Type de compte</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["client", Building2, "Client", "La clinique a souscrit : espace vide, prêt à recevoir ses salariés."], ["demo", FlaskConical, "Démo / essai", "Pour une présentation ou un essai gratuit, avec date de fin."]] as const).map(([v, Icon, t, d]) => (
              <button key={v} type="button" onClick={() => setKind(v)} className={cn("flex cursor-pointer gap-3 rounded-[14px] border p-4 text-left transition", kind === v ? "border-brand-500 bg-brand-100/40 ring-3 ring-brand-500/15" : "border-border hover:border-brand-500/50")}>
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", kind === v ? "bg-brand-500 text-white dark:text-brand-900" : "bg-surface-2 text-muted")}><Icon className="size-5" /></span>
                <span><span className="block font-semibold">{t}</span><span className="mt-0.5 block text-sm text-muted">{d}</span></span>
              </button>
            ))}
          </div>
          {kind === "demo" && (
            <div className="grid gap-4 rounded-[14px] bg-surface-2 p-4 sm:grid-cols-[180px_1fr] animate-fade-in">
              <Field label="Durée de l'essai" htmlFor="td">
                <Select id="td" value={trialDays} onChange={(e) => setTrialDays(e.target.value)}>
                  {["7", "14", "30", "60", "90"].map((d) => <option key={d} value={d}>{d} jours</option>)}
                </Select>
              </Field>
              <div className="pt-6">
                <Checkbox checked={demoData} onChange={(e) => setDemoData(e.target.checked)} label={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-4 text-accent-500" /> Remplir avec des données de démonstration</span>} description="25 salariés fictifs, 2 semaines de planning, pointages, congés et une paie calculée : la clinique découvre l'application sans rien saisir. Vous pourrez les effacer d'un clic quand elle devient cliente." />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <SectionLabel n={2}>La clinique</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Nom de l'établissement" required htmlFor="nm"><Input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Clinique Al Amal" autoFocus /></Field>
            <Field label="Adresse web" required htmlFor="sl" help={<>Les salariés y accèdent : <span className="font-mono">/{finalSlug || "…"}</span></>}>
              <Input id="sl" value={finalSlug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} className="font-mono" placeholder="clinique-al-amal" />
            </Field>
            <Field label="Pack" required htmlFor="pl" help="Modifiable à tout moment.">
              <Select id="pl" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map((p) => <option key={p}>{p}</option>)}</Select>
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <SectionLabel n={3}>Compte RH de la clinique</SectionLabel>
          <p className="-mt-2 text-sm text-muted">Cette personne gère tout l&apos;espace de la clinique : salariés, planning, congés, paie, paramètres. Elle reçoit un e-mail pour choisir son mot de passe.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" required htmlFor="af"><Input id="af" value={admin.firstName} onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })} /></Field>
            <Field label="Nom" required htmlFor="al"><Input id="al" value={admin.lastName} onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })} /></Field>
            <Field className="sm:col-span-2" label="E-mail" required htmlFor="ae"><Input id="ae" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder="directrice@clinique.ma" /></Field>
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <LinkButton href="/admin/cliniques" variant="ghost">Annuler</LinkButton>
          <Button onClick={submit} loading={busy} disabled={!valid}><UserCog /> Créer la clinique et le compte RH</Button>
        </div>
      </Card>
    </div>
  );
}

function Created({ r, name, demo }: { r: Result; name: string; demo: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(r.inviteUrl!); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-100 text-success animate-pop"><Check className="size-7" /></div>
        <h1 className="mt-4 font-display text-2xl font-bold">{name} est prête</h1>
        <p className="mt-2 text-sm text-muted">{demo ? "L'espace contient des données de démonstration." : "L'espace est vide, avec les réglages par défaut (catégories, horaires, règles, congés)."} Adresse : <span className="font-mono">/{r.slug}</span></p>
        <div className="mt-6 rounded-[14px] border border-border bg-surface-2 p-4 text-left text-sm">
          {r.existingAccount ? (
            <p><b>{r.email}</b> a déjà un compte YGHR : il se connecte avec son mot de passe habituel et retrouve la nouvelle clinique.</p>
          ) : (
            <>
              <p className="flex items-center gap-2 font-medium"><Mail className="size-4 text-brand-500" /> {r.emailSent ? <>Invitation envoyée à {r.email}</> : <>L&apos;e-mail n&apos;a pas pu partir (SMTP non configuré ?)</>}</p>
              <p className="mt-1 text-muted">Vous pouvez aussi lui transmettre ce lien (WhatsApp, SMS…). Il est valable 7 jours :</p>
              <div className="mt-2 flex gap-2"><input readOnly value={r.inviteUrl ?? ""} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Lien d'invitation" /><Button size="sm" variant="secondary" onClick={copy}>{copied ? <Check /> : <Copy />} Copier</Button></div>
            </>
          )}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <LinkButton href="/admin/cliniques/nouvelle" variant="secondary">Créer une autre clinique</LinkButton>
          <LinkButton href={`/admin/cliniques/${r.id}`}>Voir la clinique</LinkButton>
        </div>
      </Card>
    </div>
  );
}
