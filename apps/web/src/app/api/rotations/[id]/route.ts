import { item } from "@/server/crud";
import { RotationSchema, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "rotation", entity: "ROTATION", schema: RotationSchema, history: true, refs: checkRefs, include: { assignments: { include: { service: true, employee: true, staffCategory: true } } } });
