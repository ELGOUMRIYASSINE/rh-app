import { item } from "@/server/crud";
import { CoverageSchema, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "coverageRule", entity: "COVERAGE_RULE", schema: CoverageSchema, history: true, refs: checkRefs });
