import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { canDo, scopeEmployeeIds } from "@/server/context";
import { notify } from "@/server/realtime";
import { saveUpload } from "@/server/storage";

export const GET = route({ feature: "esignature", allowEmployee: true }, async ({ s }) => {
  const scope = scopeEmployeeIds(s);
  const items = await prisma.signatureRequest.findMany({ where: { organizationId: s.org.id, ...(scope ? { employeeId: { in: scope } } : {}) }, include: { employee: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return { items: items.map((x) => ({ id: x.id, title: x.title, employee: x.employee, status: x.status, fileUrl: x.fileUrl, signedFileUrl: x.signedFileUrl, signedAt: x.signedAt?.toISOString() ?? null, createdAt: x.createdAt.toISOString(), mine: x.employeeId === s.employeeId })) };
});

/** multipart: file (PDF), title, employeeIds (comma separated). One request per employee. */
export const POST = route({ feature: "esignature", permission: "documents.sign" }, async ({ s, req, log }) => {
  const f = await req.formData();
  const file = f.get("file");
  const title = String(f.get("title") ?? "").trim();
  const ids = String(f.get("employeeIds") ?? "").split(",").filter(Boolean);
  const placement = ["bottom-right", "bottom-left", "certificate"].includes(String(f.get("placement"))) ? String(f.get("placement")) : "bottom-right";
  if (!(file instanceof File) || file.type !== "application/pdf") fail(400, "Choisissez un document PDF.");
  if (title.length < 3) fail(400, "Donnez un titre au document.");
  if (!ids.length) fail(400, "Choisissez au moins un destinataire.");
  if (s.role === "CHEF" && ids.some((id) => !canDo(s, "documents.sign", id))) fail(403, "Vous ne pouvez envoyer qu'aux membres de votre équipe.");
  const emps = await prisma.employee.findMany({ where: { id: { in: ids }, organizationId: s.org.id }, include: { membership: true } });
  if (emps.length !== ids.length) fail(400, "Destinataire inconnu.");
  const saved = await saveUpload(s.org.id, "signatures", file as File).catch((e: Error) => fail(400, e.message));
  for (const e of emps) {
    const r = await prisma.signatureRequest.create({ data: { organizationId: s.org.id, employeeId: e.id, title, fileUrl: saved!.url, fields: { placement }, status: "SENT", createdById: s.userId, trail: [{ at: new Date().toISOString(), event: "Envoyé", by: `${s.user.firstName} ${s.user.lastName}` }] } });
    if (e.membership) await notify(s.org.id, [e.membership.userId], { type: "signature", title: "Document à signer", body: `« ${title} » attend votre signature.`, link: `/${s.org.slug}/salarie/signature` });
    await log("CREATE", "SIGNATURE_REQUEST", r.id, { title, employee: `${e.firstName} ${e.lastName}` });
  }
  return { count: emps.length };
});
