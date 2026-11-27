import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { PayrollDetail } from "@/components/payroll/payroll-detail";

export const metadata: Metadata = { title: "Période de paie" };

export default async function PayrollPeriodPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "payroll", "Paie");
  if (locked) return locked;
  return <PayrollDetail id={id} base={`/${org}/rh`} isRh={s.role === "RH"} />;
}
