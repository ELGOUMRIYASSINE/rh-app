import type { Metadata } from "next";
import { prisma } from "@yghr/db";

/** Each clinic gets its own browser-tab title and icon. */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const o = await prisma.organization.findUnique({ where: { slug: org }, select: { name: true } });
  if (!o) return {};
  return { title: { default: o.name, template: `%s · ${o.name}` } };
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return children;
}
