"use client";
import { useState } from "react";
import { Button, Field, Input } from "@yghr/ui";
import { PasswordStrength } from "@/components/password-strength";

export function SetPasswordForm({ token, endpoint, cta }: { token: string; endpoint: string; cta: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setLoading(true);
    setError(null);
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
      setLoading(false);
      return;
    }
    window.location.href = data.redirect;
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nouveau mot de passe" htmlFor="pw" help="10 caractères minimum, avec des lettres et des chiffres.">
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <PasswordStrength value={password} />
      <Field label="Confirmer le mot de passe" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <div role="alert" className="rounded-[10px] border border-danger/25 bg-danger-100 px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      <Button type="submit" size="lg" className="w-full" loading={loading}>{cta}</Button>
    </form>
  );
}
