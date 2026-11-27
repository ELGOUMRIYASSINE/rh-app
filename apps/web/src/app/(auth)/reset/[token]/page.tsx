import type { Metadata } from "next";
import Link from "next/link";
import { findValidToken } from "@/server/tokens";
import { SetPasswordForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await findValidToken(token, "RESET");
  if (!t) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">Lien expiré</h1>
        <p className="text-sm text-muted">Ce lien de réinitialisation n'est plus valable. Vous pouvez en demander un nouveau depuis la page de connexion.</p>
        <Link href="/login" className="inline-block text-sm font-medium text-brand-500 hover:underline">Retour à la connexion</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold">Nouveau mot de passe</h1>
        <p className="mt-1.5 text-sm text-muted">Pour le compte {t.user.email}.</p>
      </div>
      <SetPasswordForm token={token} endpoint="/api/auth/reset" cta="Enregistrer et me connecter" />
    </div>
  );
}
