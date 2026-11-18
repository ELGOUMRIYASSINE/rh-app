import { item } from "@/server/crud";
import { TabletSchema, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "tablet", entity: "TABLET", schema: TabletSchema, feature: "tablets", refs: checkRefs });
