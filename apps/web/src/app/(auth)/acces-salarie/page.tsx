import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, spaceForRole } from "@/server/context";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = { title: "Espace salarié indisponible" };

export default async function EmployeeAccessPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.org.features.includes("employee_accounts") || s.role !== "SALARIE") redirect(`/${s.org.slug}/${spaceForRole(s.role)}`);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-bold">Espace salarié indisponible</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted"><b className="text-text">{s.org.name}</b> n&apos;utilise pas les comptes salariés pour le moment. Pour votre planning, vos congés ou vos documents, adressez-vous à votre service RH.</p>
      </div>
      <LogoutButton />
    </div>
  );
}
