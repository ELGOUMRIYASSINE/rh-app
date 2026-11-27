import { z } from "zod";
import { route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { dayDetail } from "@/server/attendance";

export const GET = route({ feature: "attendance", permission: "attendance.validate", query: z.object({ date: zDate }) }, async ({ s, query }) => dayDetail(s.org.id, query.date, scopeEmployeeIds(s)));
