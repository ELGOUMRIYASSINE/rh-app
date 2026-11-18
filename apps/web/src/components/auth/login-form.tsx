"use client";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Button, Checkbox, Field, Input } from "@yghr/ui";
import { toast } from "sonner";

type Step = "password" | "2fa" | "forgot";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data;
}

export function LoginForm({ next }: { next?: string }) {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (step === "forgot") {
        const r = await post("/api/auth/forgot", { email });
        toast.success(r.message);
        setStep("password");
      } else if (step === "2fa") {
        const r = await post("/api/auth/login", { challenge, code, next });
        window.location.href = r.redirect;
        return;
      } else {
        const r = await post("/api/auth/login", { email, password, persistent, next });
        if (r.twoFactor) {
          setChallenge(r.challenge);
          setStep("2fa");
        } else {
          window.location.href = r.redirect;
          return;
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {step === "password" && (
        <>
          <div>
            <h1 className="font-display text-[26px] font-bold">Bon retour 👋</h1>
            <p className="mt-1.5 text-sm text-muted">Connectez-vous à votre espace YGHR.</p>
          </div>
          <Field label="Adresse e-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" placeholder="vous@clinique.ma" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Mot de passe" htmlFor="password">
            <div className="relative">
              <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1 grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:text-text" aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <div className="flex items-center justify-between">
            <Checkbox label="Rester connecté" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />
            <button type="button" className="cursor-pointer text-sm font-medium text-brand-500 hover:underline" onClick={() => { setStep("forgot"); setError(null); }}>
              Mot de passe oublié ?
            </button>
          </div>
        </>
      )}
      {step === "2fa" && (
        <>
          <div className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-500"><KeyRound className="size-6" strokeWidth={1.75} /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">Vérification en deux étapes</h1>
            <p className="mt-1.5 text-sm text-muted">Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
          </div>
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="h-12 text-center font-mono text-xl tracking-[0.5em]" autoFocus />
        </>
      )}
      {step === "forgot" && (
        <>
          <button type="button" onClick={() => setStep("password")} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Retour</button>
          <div className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-500"><Mail className="size-6" strokeWidth={1.75} /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">Mot de passe oublié</h1>
            <p className="mt-1.5 text-sm text-muted">Indiquez votre e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe (valable 7 jours).</p>
          </div>
          <Field label="Adresse e-mail" htmlFor="email2">
            <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
        </>
      )}
      {error && <div role="alert" className="rounded-[10px] border border-danger/25 bg-danger-100 px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {step === "forgot" ? "Envoyer le lien" : step === "2fa" ? "Vérifier" : "Se connecter"}
      </Button>
    </form>
  );
}
