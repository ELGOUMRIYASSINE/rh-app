import type { Metadata } from "next";
import { Card, PageHeader } from "@yghr/ui";
import { activityFeed } from "@/server/platform-data";
import { Feed } from "@/components/admin/bits";
import { ActivityFilter } from "@/components/admin/activity-filter";

export const metadata: Metadata = { title: "Activité" };
export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const a = (await searchParams).a || undefined;
  const items = await activityFeed({ take: 200, action: a });
  return (
    <div>
      <PageHeader title="Activité" subtitle="Le journal de toutes les cliniques : connexions, échecs de connexion, créations, suppressions, accès du support…" actions={<ActivityFilter value={a ?? ""} />} />
      <Card><Feed items={items} /></Card>
    </div>
  );
}
