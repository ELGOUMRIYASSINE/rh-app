import { collection } from "@/server/crud";
import { CentreSchema } from "@/server/settings-schemas";
export const { GET, POST } = collection({ model: "centre", entity: "CENTRE", schema: CentreSchema, feature: "structure", orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { status: "ACTIVE" } }, services: true } } } });
