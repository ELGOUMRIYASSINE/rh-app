import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@yghr/db";
import { ACCESS_COOKIE, verifyAccess } from "@/server/auth";
import { OrgPicker } from "@/components/auth/org-picker";
import { logoSrc } from "@/server/branding";

export const metadata: Metadata = { title: "Choisir une organisation" };
const ROLE: Record<string, string> = { RH: "Responsable RH", CHEF: "Chef d'équipe", SALARIE: "Salarié", SUPER_ADMIN: "Administrateur YGHR" };

export default async function SelectOrgPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const claims = await verifyAccess((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!claims) redirect("/login");
  const { slug } = await searchParams;
  const ms = await prisma.membership.findMany({ where: { userId: claims.sub, active: true }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  const items = ms.map((m) => ({ id: m.organizationId, name: m.organization.name, slug: m.organization.slug, logo: logoSrc(m.organization.slug, m.organization.logoUrl), role: ROLE[m.role] ?? m.role }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold">Choisissez une organisation</h1>
        <p className="mt-1.5 text-sm text-muted">{slug && !items.some((i) => i.slug === slug) ? "Vous n'avez pas accès à cette organisation. " : ""}Votre compte est rattaché à plusieurs organisations.</p>
      </div>
      <OrgPicker items={items} preferred={slug} />
    </div>
  );
}
