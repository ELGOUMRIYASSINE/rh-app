import { z } from "zod";
import { startOfIsoWeek } from "@yghr/core";
import { route, zDate } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { weekSummary } from "@/server/attendance";

export const GET = route({ feature: "attendance", permission: "attendance.validate", query: z.object({ from: zDate }) }, async ({ s, query }) => ({ days: await weekSummary(s.org.id, startOfIsoWeek(query.from), scopeEmployeeIds(s)) }));
