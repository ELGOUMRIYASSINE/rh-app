import { requirePage } from "@/server/context";
import { Shell } from "@/server/shell";
import { RH_NAV } from "@/components/shell/nav";

export default async function RhLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "rh");
  return <Shell s={s} space="rh" nav={RH_NAV}>{children}</Shell>;
}
