import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, spaceForRole } from "@/server/context";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = { title: "Accès suspendu" };

export default async function SuspendedPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.org.blocked) redirect(`/${s.org.slug}/${spaceForRole(s.role)}`);
  const trialOver = s.org.status === "TRIAL";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-bold">{trialOver ? "Période d'essai terminée" : "Accès suspendu"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {trialOver
            ? <>La période d&apos;essai de <b className="text-text">{s.org.name}</b> est arrivée à son terme. Vos données sont conservées : contactez l&apos;équipe YGHR pour activer votre abonnement.</>
            : <>L&apos;accès de <b className="text-text">{s.org.name}</b> à YGHR est momentanément suspendu. Vos données sont conservées : contactez l&apos;équipe YGHR pour le rétablir.</>}
        </p>
      </div>
      <div className="rounded-[14px] border border-border bg-surface p-4 text-sm">
        <div className="font-semibold">Équipe YGHR</div>
        <div className="mt-1 text-muted">{process.env.SALES_EMAIL ?? "commercial@yghr.ma"}</div>
      </div>
      <LogoutButton />
    </div>
  );
}
