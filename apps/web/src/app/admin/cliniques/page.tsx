import type { Metadata } from "next";
import { clinicsList } from "@/server/platform-data";
import { ClinicsView } from "@/components/admin/clinics-view";

export const metadata: Metadata = { title: "Cliniques" };
export const dynamic = "force-dynamic";

export default async function ClinicsPage() {
  return <ClinicsView clinics={await clinicsList()} />;
}
