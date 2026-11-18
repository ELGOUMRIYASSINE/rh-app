import { collection } from "@/server/crud";
import { ShiftTypeSchema, checkRefs } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "shiftType", entity: "SHIFT_TYPE", schema: ShiftTypeSchema, history: true, refs: checkRefs, orderBy: { startTime: "asc" } });
