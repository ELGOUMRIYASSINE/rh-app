import { z } from "zod";
import { prisma, type Prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { scopeEmployeeIds } from "@/server/context";
import { assertRefs, EmployeeInput, employeeData, placeholderEmail, provisionAccess } from "@/server/employees";

export const GET = route(
  { feature: "employees", query: z.object({ q: z.string().optional(), status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) },
  async ({ s, query }) => {
    const scope = scopeEmployeeIds(s);
    const where: Prisma.EmployeeWhereInput = {
      organizationId: s.org.id,
      ...(query.status === "ALL" ? {} : { status: query.status ?? "ACTIVE" }),
      ...(scope ? { id: { in: scope } } : {}),
      ...(query.q
        ? { OR: [{ firstName: { contains: query.q, mode: "insensitive" } }, { lastName: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { matricule: { contains: query.q, mode: "insensitive" } }] }
        : {}),
    };
    const items = await prisma.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: query.limit ?? 200,
      select: { id: true, firstName: true, lastName: true, matricule: true, position: true, email: true, serviceId: true, staffCategoryId: true, status: true },
    });
    return { items };
  },
);

export const POST = route({ feature: "employees", permission: "team.add", body: EmployeeInput.extend({ sendInvite: z.boolean().optional() }) }, async ({ s, body, log }) => {
  await assertRefs(s.org.id, body);
  // Multi-site organisations: every employee belongs to a centre.
  if (!body.centreId && (await prisma.centre.count({ where: { organizationId: s.org.id, active: true } }))) fail(400, "Choisissez le centre du salarié.");
  const accounts = s.org.features.includes("employee_accounts");
  const email = body.email || placeholderEmail(s.org.slug);
  if (await prisma.employee.findFirst({ where: { organizationId: s.org.id, email } })) fail(409, "Un salarié avec cet e-mail existe déjà.");
  // A team lead adding someone makes them part of their team.
  const teamLeadId = s.role === "CHEF" ? s.employeeId : (body.teamLeadId ?? null);
  const emp = await prisma.employee.create({ data: { ...employeeData(body), organizationId: s.org.id, teamLeadId, firstName: body.firstName, lastName: body.lastName, email } });
  const access = body.sendInvite === false || !accounts || email.endsWith(".invalid") ? { invited: false } : await provisionAccess({ organizationId: s.org.id, orgName: s.org.name, employeeId: emp.id, email: emp.email, firstName: emp.firstName, lastName: emp.lastName });
  await log("CREATE", "EMPLOYEE", emp.id, { name: `${emp.firstName} ${emp.lastName}`, email: emp.email });
  return { employee: emp, invited: access.invited };
});
