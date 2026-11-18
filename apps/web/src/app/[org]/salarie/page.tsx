import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { myOverview } from "@/server/me";
import { MyHome } from "@/components/me/me-views";

export const metadata: Metadata = { title: "Accueil" };

export default async function SalarieHome({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  return <MyHome data={await myOverview(s.org.id, s.employeeId!, s.userId)} base={`/${org}/salarie`} firstName={s.user.firstName} />;
}
