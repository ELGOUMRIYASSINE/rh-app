import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { SignatureModule } from "@/components/premium/signature";

export const metadata: Metadata = { title: "Signature électronique" };

export default async function SignaturePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  const locked = chefGate(s, "Signature électronique", { feature: "esignature", permission: "documents.sign" });
  if (locked) return locked;
  const employees = true ? await prisma.employee.findMany({ where: { organizationId: s.org.id, status: "ACTIVE" as const, id: { in: s.subordinateIds } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }) : [];
  return <SignatureModule canSend={true} employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} signerName={`${s.user.firstName} ${s.user.lastName}`} />;
}
