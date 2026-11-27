import { prisma } from "@yghr/db";
import { route } from "@/server/api";
import { TabletRules } from "@/server/tablet-rules";

export const GET = route({ feature: "tablets", rhOnly: true }, async ({ s }) => {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: s.org.id } });
  return { rules: TabletRules.parse(o.tabletRules ?? {}) };
});
export const PUT = route({ feature: "tablets", rhOnly: true, body: TabletRules }, async ({ s, body, log }) => {
  await prisma.organization.update({ where: { id: s.org.id }, data: { tabletRules: body } });
  await log("UPDATE", "TABLET_RULES", s.org.id, body);
  return { rules: body };
});
