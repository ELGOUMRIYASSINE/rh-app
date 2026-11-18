import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { logoSrc } from "@/server/branding";

/** Each clinic gets its own browser-tab title and icon. */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const o = await prisma.organization.findUnique({ where: { slug: org }, select: { name: true, slug: true, logoUrl: true } });
  if (!o) return {};
  const icon = logoSrc(o.slug, o.logoUrl);
  return {
    title: { default: o.name, template: `%s · ${o.name}` },
    ...(icon ? { icons: { icon, apple: icon } } : {}),
  };
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return children;
}
