import { collection } from "@/server/crud";
import { ServiceSchema, checkRefs } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "service", entity: "SERVICE", schema: ServiceSchema, history: true, refs: checkRefs, orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
