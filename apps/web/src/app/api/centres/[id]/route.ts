import { item } from "@/server/crud";
import { CentreSchema } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "centre", entity: "CENTRE", schema: CentreSchema, feature: "structure" });
