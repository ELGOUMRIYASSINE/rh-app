import { z } from "zod";
import { prisma, dbDate, fromDbDate } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { notify, rhUserIds } from "@/server/realtime";
import { saveUpload } from "@/server/storage";

export const GET = route({ feature: "expenses", allowEmployee: true }, async ({ s }) => {
  const scope = scopeEmployeeIds(s);
  const items = await prisma.expenseReport.findMany({ where: { organizationId: s.org.id, ...(scope ? { employeeId: { in: scope } } : {}) }, include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return { items: items.map((x) => ({ id: x.id, employee: x.employee, date: fromDbDate(x.date), category: x.category, description: x.description, amount: x.amount.toNumber(), vat: x.vat?.toNumber() ?? null, receiptUrl: x.receiptUrl, status: x.status, reimbursement: x.reimbursement, createdAt: x.createdAt.toISOString(), canDecide: x.status === "PENDING" && x.employeeId !== s.employeeId && canDo(s, "expenses.validate", x.employeeId) })) };
});

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.string().min(2).max(40), description: z.string().max(500).optional(), amount: z.coerce.number().positive().max(100_000), vat: z.coerce.number().min(0).max(100_000).optional(), reimbursement: z.enum(["PAYROLL", "SEPARATE"]).default("PAYROLL") });

export const POST = route({ feature: "expenses", allowEmployee: true }, async ({ s, req, log }) => {
  if (!s.employeeId) fail(400, "Aucune fiche salarié liée à votre compte.");
  const f = await req.formData();
  const body = Body.parse(Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string" && v !== "")));
  const file = f.get("receipt");
  const receipt = file instanceof File && file.size ? await saveUpload(s.org.id, "expenses", file).catch((e: Error) => fail(400, e.message)) : null;
  const x = await prisma.expenseReport.create({ data: { organizationId: s.org.id, employeeId: s.employeeId!, date: dbDate(body.date), category: body.category, description: body.description ?? null, amount: body.amount, vat: body.vat ?? null, receiptUrl: receipt?.url ?? null, reimbursement: body.reimbursement } });
  await notify(s.org.id, (await rhUserIds(s.org.id)).filter((u) => u !== s.userId), { type: "expense", title: "Nouvelle note de frais", body: `${s.user.firstName} ${s.user.lastName} · ${body.category} · ${body.amount} DH`, link: `/${s.org.slug}/rh/notes-de-frais` });
  await log("CREATE", "EXPENSE_REPORT", x.id, { amount: body.amount, category: body.category });
  return { item: x };
});
