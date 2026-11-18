import { requirePage } from "@/server/context";
import { Shell } from "@/server/shell";
import { CHEF_NAV } from "@/components/shell/nav";

export default async function ChefLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return <Shell s={s} space="chef" nav={CHEF_NAV}>{children}</Shell>;
}
