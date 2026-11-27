import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { SignatureModule } from "@/components/premium/signature";

export const metadata: Metadata = { title: "Signature électronique" };

export default async function SignaturePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  const locked = gate(s, "esignature", "Signature électronique");
  if (locked) return locked;
  const employees = false ? await prisma.employee.findMany({ where: { id: "__none__" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }) : [];
  return <SignatureModule canSend={false} employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))} signerName={`${s.user.firstName} ${s.user.lastName}`} />;
}
