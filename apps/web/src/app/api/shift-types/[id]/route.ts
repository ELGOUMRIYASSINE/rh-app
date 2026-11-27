import { item } from "@/server/crud";
import { ShiftTypeSchema, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "shiftType", entity: "SHIFT_TYPE", schema: ShiftTypeSchema, history: true, refs: checkRefs, orderBy: { startTime: "asc" } });
