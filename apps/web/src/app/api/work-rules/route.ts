import { collection } from "@/server/crud";
import { WorkRuleSchema, mapWorkRule, checkRefs } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "workRule", entity: "WORK_RULE", schema: WorkRuleSchema, history: true, map: mapWorkRule, refs: checkRefs, orderBy: { updatedAt: "asc" } });
