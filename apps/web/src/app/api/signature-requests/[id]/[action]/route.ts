import { z } from "zod";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { notify } from "@/server/realtime";
import { simpleEmail } from "@/server/mail";
import { decodeSignatureImage, hashOtp, newOtp, type Placement, stampSignedPdf } from "@/server/signature";
import { rateLimit } from "@/server/rate-limit";

type Trail = { at: string; event: string; by?: string; ip?: string | null }[];

/** otp (send code) | sign {code, fullName} | decline {reason} | cancel (sender). */
export const POST = route({ feature: "esignature", allowEmployee: true, body: z.object({ code: z.string().optional(), fullName: z.string().optional(), reason: z.string().max(500).optional(), method: z.enum(["otp", "draw"]).default("otp"), signature: z.string().max(900_000).optional(), consent: z.boolean().optional() }) }, async ({ s, params, body, ip, userAgent, log }) => {
  const r = await prisma.signatureRequest.findFirst({ where: { id: params.id, organizationId: s.org.id }, include: { employee: { include: { membership: { include: { user: true } } } } } });
  if (!r) fail(404, "Demande introuvable.");
  const req = r!;
  const trail = (req.trail as Trail | null) ?? [];
  const isSigner = req.employeeId === s.employeeId;
  if (params.action === "cancel") {
    if (req.createdById !== s.userId && s.role !== "RH") fail(403, "Accès refusé.");
    if (req.status !== "SENT") fail(400, "Ce document n'est plus en attente.");
    await prisma.signatureRequest.update({ where: { id: req.id }, data: { status: "EXPIRED", trail: [...trail, { at: new Date().toISOString(), event: "Annulé", by: `${s.user.firstName} ${s.user.lastName}` }] } });
    await log("UPDATE", "SIGNATURE_REQUEST", req.id, { cancelled: true });
    return { ok: true };
  }
  if (!isSigner) fail(403, "Seul le destinataire peut signer ce document.");
  if (req.status !== "SENT") fail(400, "Ce document n'est plus en attente de signature.");
  const email = req.employee.membership?.user.email ?? req.employee.email;
  if (params.action === "otp") {
    if (!rateLimit(`otp:${req.id}`, 5, 15 * 60_000).ok) fail(429, "Trop de codes demandés. Réessayez dans quelques minutes.");
    const code = newOtp();
    await prisma.signatureRequest.update({ where: { id: req.id }, data: { otpHash: hashOtp(code, req.id), trail: [...trail, { at: new Date().toISOString(), event: "Code envoyé", ip }] } });
    await simpleEmail(email, `Votre code de signature : ${code}`, "Code de signature", [`Votre code pour signer « ${req.title} » est : ${code}`, "Il est valable 10 minutes. Ne le communiquez à personne."]);
    if (process.env.NODE_ENV !== "production") console.info(`[signature] code pour ${email} : ${code}`);
    return { ok: true, sentTo: email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") };
  }
  if (params.action === "decline") {
    await prisma.signatureRequest.update({ where: { id: req.id }, data: { status: "DECLINED", trail: [...trail, { at: new Date().toISOString(), event: `Refusé${body.reason ? ` : ${body.reason}` : ""}`, ip }] } });
    await notify(s.org.id, [req.createdById], { type: "signature", title: "Signature refusée", body: `${req.employee.firstName} ${req.employee.lastName} a refusé de signer « ${req.title} ».`, link: `/${s.org.slug}/rh/signature` });
    await log("REJECT", "SIGNATURE_REQUEST", req.id, { reason: body.reason });
    return { ok: true };
  }
  if (params.action !== "sign") fail(404, "Action inconnue.");
  if (!rateLimit(`sign:${req.id}`, 6, 15 * 60_000).ok) fail(429, "Trop de tentatives.");
  let signatureImage: Uint8Array | null = null;
  if (body.method === "draw") {
    // Handwritten: the signer is authenticated by their session; the drawing is embedded in the PDF.
    if (!body.consent) fail(400, "Cochez la case de consentement pour signer.");
    signatureImage = decodeSignatureImage(body.signature ?? "");
    if (!signatureImage) fail(400, "Tracez votre signature dans le cadre avant de valider.");
  } else {
    const lastSent = [...trail].reverse().find((t) => t.event === "Code envoyé");
    if (!req.otpHash || !lastSent || Date.now() - new Date(lastSent.at).getTime() > 10 * 60_000) fail(400, "Code expiré : demandez-en un nouveau.");
    if (!body.code || hashOtp(body.code, req.id) !== req.otpHash) fail(400, "Code incorrect.");
  }
  const expected = `${req.employee.firstName} ${req.employee.lastName}`.toLowerCase().replace(/\s+/g, " ");
  if ((body.fullName ?? "").trim().toLowerCase().replace(/\s+/g, " ") !== expected) fail(400, `Saisissez votre nom complet tel qu'il apparaît : ${req.employee.firstName} ${req.employee.lastName}.`);
  const when = new Date();
  const placement = ((req.fields as { placement?: Placement } | null)?.placement ?? "bottom-right") as Placement;
  const { signedUrl, originalHash } = await stampSignedPdf({ fileUrl: req.fileUrl, organizationId: s.org.id, requestId: req.id, signer: `${req.employee.firstName} ${req.employee.lastName}`, email, ip, when, title: req.title, timeZone: s.org.timezone, method: body.method, signatureImage, placement });
  await prisma.signatureRequest.update({ where: { id: req.id }, data: { status: "SIGNED", signedAt: when, signedIp: ip, signedFileUrl: signedUrl, otpHash: null, trail: [...trail, { at: when.toISOString(), event: `Signé ${body.method === "draw" ? "à la main" : "par code e-mail"} (SHA-256 ${originalHash.slice(0, 16)}…)`, ip }] } });
  await prisma.document.create({ data: { organizationId: s.org.id, employeeId: req.employeeId, title: `${req.title} (signé)`, category: "Document signé", fileUrl: signedUrl, mimeType: "application/pdf", uploadedById: s.userId } });
  await notify(s.org.id, [req.createdById], { type: "signature", title: "Document signé ✅", body: `${req.employee.firstName} ${req.employee.lastName} a signé « ${req.title} ».`, link: `/${s.org.slug}/rh/signature` });
  await log("VALIDATE", "SIGNATURE_REQUEST", req.id, { signed: true, method: body.method, ip, userAgent, sha256: originalHash });
  return { ok: true, signedFileUrl: signedUrl };
});
