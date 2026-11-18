import { requirePage } from "@/server/context";
import { Shell } from "@/server/shell";
import { SALARIE_NAV } from "@/components/shell/nav";

export default async function SalarieLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  return <Shell s={s} space="salarie" nav={SALARIE_NAV}>{children}</Shell>;
}
