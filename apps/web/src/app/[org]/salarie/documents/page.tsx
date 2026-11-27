import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { MyDocuments } from "@/components/me/me-views";

export const metadata: Metadata = { title: "Mes documents" };

export default async function MyDocsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  const [payslips, docs] = await Promise.all([
    prisma.payslip.findMany({ where: { employeeId: s.employeeId!, period: { status: "LOCKED", organizationId: s.org.id } }, include: { period: true }, orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }] }),
    prisma.document.findMany({ where: { employeeId: s.employeeId!, organizationId: s.org.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return <MyDocuments payslips={payslips.map((p) => ({ id: p.id, month: p.period.month, year: p.period.year, net: p.net.toNumber() }))} documents={docs.map((d) => ({ id: d.id, title: d.title, category: d.category, createdAt: d.createdAt.toISOString(), fileUrl: d.fileUrl }))} />;
}
