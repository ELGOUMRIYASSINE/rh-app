import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { gate } from "@/server/shell";
import { Messaging } from "@/components/premium/messaging";

export const metadata: Metadata = { title: "Messagerie" };

export default async function MessagesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "salarie");
  return gate(s, "messaging", "Messagerie") ?? <Messaging />;
}
