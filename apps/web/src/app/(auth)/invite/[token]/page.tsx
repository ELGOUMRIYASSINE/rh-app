import type { Metadata } from "next";
import Link from "next/link";
import { findValidToken } from "@/server/tokens";
import { SetPasswordForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Activer mon compte" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await findValidToken(token, "INVITE");
  if (!t) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">Invitation expirée</h1>
        <p className="text-sm text-muted">Ce lien n'est plus valable (il expire après 7 jours ou après utilisation). Demandez à votre responsable RH de renvoyer l'invitation.</p>
        <Link href="/login" className="inline-block text-sm font-medium text-brand-500 hover:underline">Aller à la connexion</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-500">{t.organization?.name}</p>
        <h1 className="mt-1 font-display text-[26px] font-bold">Bienvenue, {t.user.firstName} !</h1>
        <p className="mt-1.5 text-sm text-muted">Choisissez votre mot de passe pour accéder à votre espace : planning, congés, présences et bulletins.</p>
      </div>
      <SetPasswordForm token={token} endpoint="/api/auth/invite/accept" cta="Activer mon compte" />
    </div>
  );
}
