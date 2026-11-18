import { collection } from "@/server/crud";
import { CategorySchema } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "staffCategory", entity: "STAFF_CATEGORY", schema: CategorySchema, history: true, orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
