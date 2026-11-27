import type { Metadata } from "next";
import { ticketsList } from "@/server/platform-data";
import { TicketsView } from "@/components/admin/support-views";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = (await searchParams).f ?? "open";
  return <TicketsView tickets={await ticketsList(f)} filter={f} />;
}
