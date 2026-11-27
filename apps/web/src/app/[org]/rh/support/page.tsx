import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { ticketThread } from "@/server/platform-data";
import { ClinicSupport } from "@/components/support/clinic-support";

export const metadata: Metadata = { title: "Support YGHR" };

export default async function SupportPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  const { t } = await searchParams;
  const [tickets, thread] = await Promise.all([
    prisma.supportTicket.findMany({ where: { organizationId: s.org.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { messages: true } } } }),
    t ? ticketThread(t, s.org.id) : Promise.resolve(null),
  ]);
  return (
    <ClinicSupport
      base={`/${org}/rh/support`}
      tickets={tickets.map((x) => ({ id: x.id, subject: x.subject, category: x.category, status: x.status, priority: x.priority, lastFromPlatform: x.lastFromPlatform, messages: x._count.messages, updatedAt: x.updatedAt.toISOString() }))}
      thread={thread}
    />
  );
}
