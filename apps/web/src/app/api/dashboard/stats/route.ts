import { route } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { dashboardStats } from "@/server/dashboard";

export const GET = route({ feature: "dashboard" }, async ({ s }) => {
  const scope = scopeEmployeeIds(s);
  return dashboardStats(s.org.id, scope ? { employeeIds: scope } : {});
});
