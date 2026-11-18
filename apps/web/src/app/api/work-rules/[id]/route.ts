import { item } from "@/server/crud";
import { WorkRuleSchema, mapWorkRule, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "workRule", entity: "WORK_RULE", schema: WorkRuleSchema, history: true, map: mapWorkRule, refs: checkRefs, orderBy: { updatedAt: "asc" } });
