import type { Metadata } from "next";
import { errorsList } from "@/server/platform-data";
import { IncidentsView } from "@/components/admin/incidents-view";

export const metadata: Metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = (await searchParams).f === "all" ? "all" : "open";
  return <IncidentsView errors={await errorsList(f)} filter={f} />;
}
