"use client";
import { useRouter } from "next/navigation";
import { Select } from "@yghr/ui";

const OPTIONS: [string, string][] = [["", "Toutes les actions"], ["LOGIN", "Connexions"], ["LOGIN_FAILED", "Échecs de connexion"], ["CREATE", "Créations"], ["UPDATE", "Modifications"], ["DELETE", "Suppressions"], ["PUBLISH", "Publications de planning"], ["CALCULATE", "Calculs de paie"], ["SUSPEND", "Suspensions"], ["SUPPORT_ACCESS", "Accès du support"]];

export function ActivityFilter({ value }: { value: string }) {
  const router = useRouter();
  return <Select value={value} onChange={(e) => router.push(`/admin/activite${e.target.value ? `?a=${e.target.value}` : ""}`)} className="w-auto" aria-label="Filtrer par action">{OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
}
