import { item } from "@/server/crud";
import { CategorySchema } from "@/server/settings-schemas";
export const { PATCH, DELETE } = item({ model: "staffCategory", entity: "STAFF_CATEGORY", schema: CategorySchema, history: true, orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
