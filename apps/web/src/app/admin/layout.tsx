import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePlatformPage } from "@/server/platform";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: { default: "Console", template: "%s · Console YGHR" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPage();
  const [tickets, errors] = await Promise.all([
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, lastFromPlatform: false } }),
    prisma.errorEvent.count({ where: { resolved: false } }),
  ]);
  return <AdminShell admin={admin} counts={{ tickets, errors }}>{children}</AdminShell>;
}
