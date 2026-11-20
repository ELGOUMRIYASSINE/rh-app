import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clinicDetail } from "@/server/platform-data";
import { ClinicDetailView } from "@/components/admin/clinic-detail";

export const metadata: Metadata = { title: "Clinique" };
export const dynamic = "force-dynamic";

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await clinicDetail((await params).id);
  if (!d) notFound();
  return <ClinicDetailView d={d} />;
}
