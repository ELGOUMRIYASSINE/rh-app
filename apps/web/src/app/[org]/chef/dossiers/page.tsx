import type { Metadata } from "next";
import { FolderOpen, FileText } from "lucide-react";
import { prisma } from "@yghr/db";
import { Card, EmptyState, PageHeader } from "@yghr/ui";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { frDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dossiers de l'équipe" };

export default async function ChefDocs({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  const locked = chefGate(s, "Dossiers", { permission: "documents.view" });
  if (locked) return locked;
  const docs = await prisma.document.findMany({ where: { organizationId: s.org.id, employeeId: { in: s.subordinateIds } }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Dossiers" subtitle="Documents RH des membres de votre équipe" />
      <Card>
        {docs.length === 0 ? <EmptyState icon={<FolderOpen />} title="Aucun document">Les documents ajoutés par le service RH aux dossiers de votre équipe apparaîtront ici.</EmptyState> : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="size-5 text-brand-500" strokeWidth={1.75} />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{d.title}</div><div className="text-xs text-muted">{d.employee ? `${d.employee.firstName} ${d.employee.lastName} · ` : ""}{d.category} · {frDate(d.createdAt)}</div></div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-500 hover:underline">Ouvrir</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
