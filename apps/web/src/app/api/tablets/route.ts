import { randomBytes } from "node:crypto";
import { collection } from "@/server/crud";
import { TabletSchema, checkRefs } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "tablet", entity: "TABLET", schema: TabletSchema, feature: "tablets", refs: checkRefs, include: { centre: { select: { name: true } } }, map: (d) => ({ ...d, token: randomBytes(24).toString("base64url") }) });
