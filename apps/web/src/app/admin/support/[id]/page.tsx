import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@yghr/db";
import { ticketThread } from "@/server/platform-data";
import { Thread } from "@/components/admin/support-views";

export const metadata: Metadata = { title: "Demande de support" };
export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ticketThread(id);
  if (!t) notFound();
  // Opening a new request moves it to "in progress".
  if (t.status === "OPEN") await prisma.supportTicket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  return <Thread t={{ ...t, status: t.status === "OPEN" ? "IN_PROGRESS" : t.status }} side="platform" postUrl={`/api/admin/tickets/${id}`} patchUrl={`/api/admin/tickets/${id}`} backHref="/admin/support" backLabel="Support" />;
}
