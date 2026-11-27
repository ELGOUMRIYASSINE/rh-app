import { item } from "@/server/crud";
import { ServiceSchema, checkRefs } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "service", entity: "SERVICE", schema: ServiceSchema, history: true, refs: checkRefs, orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
