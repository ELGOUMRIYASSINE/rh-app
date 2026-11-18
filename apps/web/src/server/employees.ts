import "server-only";
import { z } from "zod";
import { prisma } from "@yghr/db";
import { createAuthToken } from "./auth";
import { inviteEmail } from "./mail";
import { zDate, zOptNum, zOptStr } from "./api";

export const EmployeeInput = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().trim().min(1, "Nom requis").max(80),
  email: z.string().trim().toLowerCase().email("E-mail invalide"),
  phone: zOptStr,
  matricule: zOptStr,
  position: zOptStr,
  serviceId: zOptStr,
  staffCategoryId: zOptStr,
  centreId: zOptStr,
  teamLeadId: zOptStr,
  contractType: z.enum(["CDI", "CDD", "INTERIM", "STAGE"]).optional().nullable(),
  contractReason: zOptStr,
  weeklyHours: zOptNum,
  hourlyRate: zOptNum,
  netHourlyRate: zOptNum,
  monthlyBase: zOptNum,
  birthDate: zDate.optional().nullable().or(z.literal("").transform(() => null)),
  hireDate: zDate.optional().nullable().or(z.literal("").transform(() => null)),
  cnssNumber: zOptStr,
  cin: zOptStr,
  familyDependents: z.coerce.number().int().min(0).max(20).optional(),
});
export type EmployeeInputT = z.infer<typeof EmployeeInput>;

export function employeeData(i: Partial<EmployeeInputT>) {
  const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00Z`) : null);
  return {
    firstName: i.firstName,
    lastName: i.lastName,
    email: i.email,
    phone: i.phone,
    matricule: i.matricule,
    position: i.position,
    serviceId: i.serviceId,
    staffCategoryId: i.staffCategoryId,
    centreId: i.centreId,
    teamLeadId: i.teamLeadId,
    contractType: i.contractType,
    contractReason: i.contractReason,
    weeklyHours: i.weeklyHours,
    hourlyRate: i.hourlyRate,
    netHourlyRate: i.netHourlyRate,
    monthlyBase: i.monthlyBase,
    birthDate: d(i.birthDate),
    hireDate: d(i.hireDate),
    cnssNumber: i.cnssNumber,
    cin: i.cin,
    familyDependents: i.familyDependents,
  };
}

/** Ensure referenced ids belong to the organisation (never trust the client). */
export async function assertRefs(organizationId: string, i: Partial<EmployeeInputT>) {
  const checks: Promise<unknown>[] = [];
  if (i.serviceId) checks.push(prisma.service.findFirstOrThrow({ where: { id: i.serviceId, organizationId } }));
  if (i.staffCategoryId) checks.push(prisma.staffCategory.findFirstOrThrow({ where: { id: i.staffCategoryId, organizationId } }));
  if (i.teamLeadId) checks.push(prisma.employee.findFirstOrThrow({ where: { id: i.teamLeadId, organizationId } }));
  if (i.centreId) checks.push(prisma.centre.findFirstOrThrow({ where: { id: i.centreId, organizationId } }));
  await Promise.all(checks);
}

/**
 * Create the User (if needed) and the SALARIE membership linked to the employee,
 * then e-mail a 7-day invitation when the user has no password yet.
 */
export async function provisionAccess(o: { organizationId: string; orgName: string; employeeId: string; email: string; firstName: string; lastName: string; role?: "SALARIE" | "CHEF"; permissions?: object; password?: string | null }) {
  let user = await prisma.user.findUnique({ where: { email: o.email } });
  if (!user) {
    const { hashPassword } = await import("./auth");
    user = await prisma.user.create({ data: { email: o.email, firstName: o.firstName, lastName: o.lastName, passwordHash: o.password ? await hashPassword(o.password) : null } });
  }
  const existing = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: o.organizationId } } });
  if (existing) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: { employeeId: existing.employeeId ?? o.employeeId, active: true, ...(o.role && existing.role !== "RH" ? { role: o.role } : {}), ...(o.permissions ? { permissions: o.permissions } : {}) },
    });
  } else {
    await prisma.membership.create({ data: { userId: user.id, organizationId: o.organizationId, role: o.role ?? "SALARIE", employeeId: o.employeeId, permissions: o.permissions } });
  }
  let invited = false;
  if (!user.passwordHash) {
    const token = await createAuthToken("INVITE", user.id, o.organizationId);
    await inviteEmail({ to: user.email, firstName: user.firstName, orgName: o.orgName, token, asLead: o.role === "CHEF" });
    invited = true;
  }
  return { userId: user.id, invited };
}
