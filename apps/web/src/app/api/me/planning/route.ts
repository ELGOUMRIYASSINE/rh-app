import { z } from "zod";
import { fail, route, zDate } from "@/server/api";
import { myShifts } from "@/server/me";

export const GET = route({ allowEmployee: true, query: z.object({ from: zDate, to: zDate }) }, async ({ s, query }) => {
  if (!s.employeeId) fail(400, "Aucune fiche salarié liée à votre compte.");
  return myShifts(s.org.id, s.employeeId!, query.from, query.to);
});
