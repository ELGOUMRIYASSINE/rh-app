import type { Metadata } from "next";
import { todayIn } from "@yghr/db";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { PayrollList } from "@/components/payroll/payroll-list";

export const metadata: Metadata = { title: "Paie" };

export default async function PayrollPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ new?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const s = await requirePage(org, "rh");
  const locked = gate(s, "payroll", "Paie");
  if (locked) return locked;
  return <PayrollList base={`/${org}/rh`} openNew={sp.new === "1"} today={todayIn(s.org.timezone)} />;
}
