import type { Metadata } from "next";
import { requirePage } from "@/server/context";
import { chefGate } from "@/server/shell";
import { Messaging } from "@/components/premium/messaging";

export const metadata: Metadata = { title: "Messagerie" };

export default async function MessagesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const s = await requirePage(org, "chef");
  return chefGate(s, "Messagerie", { feature: "messaging", permission: "messaging.access" }) ?? <Messaging />;
}
