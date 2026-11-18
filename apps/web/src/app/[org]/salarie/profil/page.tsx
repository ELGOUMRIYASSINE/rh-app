import type { Metadata } from "next";
import { prisma } from "@yghr/db";
import { requirePage } from "@/server/context";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Mon profil" };

export default async function ProfilePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
  return <ProfileView tz={s.org.timezone} user={{ firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, totpEnabled: u.totpEnabled, role: s.role }} />;
}
