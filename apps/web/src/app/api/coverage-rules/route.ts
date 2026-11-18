import { collection } from "@/server/crud";
import { CoverageSchema, checkRefs } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "coverageRule", entity: "COVERAGE_RULE", schema: CoverageSchema, history: true, refs: checkRefs });
