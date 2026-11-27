import { z } from "zod";
import { liveBoard, prisma } from "@yghr/db";
import { route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";

export const GET = route({ feature: "attendance", query: z.object({ date: zDate.optional() }) }, async ({ s, query }) => {
  const scope = scopeEmployeeIds(s);
  return liveBoard(prisma, s.org.id, query.date, scope ? { employeeIds: scope } : {});
});
