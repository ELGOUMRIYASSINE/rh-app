import { clearOrgData, prisma } from "@yghr/db";
import { platformRoute } from "@/server/platform";
import { fail } from "@/server/api";

/** Turn a demo clinic into a real one: removes employees, planning, punches, leave and payroll; keeps settings and RH accounts. */
export const POST = platformRoute({}, async ({ params, log }) => {
  const org = await prisma.organization.findUnique({ where: { id: params.id! } });
  if (!org) fail(404, "Clinique introuvable.");
  await clearOrgData(prisma, org!.id);
  await log(org!.id, "DELETE", "DEMO_DATA", org!.id, { name: org!.name });
  return { ok: true };
});
