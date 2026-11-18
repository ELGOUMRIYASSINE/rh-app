import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";

/** GET: start enrolment (new secret + QR). POST {code}: confirm. DELETE {code}: disable. */
export const GET = route({ allowEmployee: true }, async ({ s }) => {
  const secret = new OTPAuth.Secret({ size: 20 });
  await prisma.user.update({ where: { id: s.userId }, data: { totpSecret: secret.base32, totpEnabled: false } });
  const totp = new OTPAuth.TOTP({ secret, issuer: "YGHR", label: s.user.email });
  const uri = totp.toString();
  return { secret: secret.base32, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#0B2A2F" } }) };
});

export const POST = route({ allowEmployee: true, body: z.object({ code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres") }) }, async ({ s, body, log }) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (!user.totpSecret) fail(400, "Commencez par générer un QR code.");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret!), issuer: "YGHR", label: user.email });
  if (totp.validate({ token: body.code, window: 1 }) === null) fail(400, "Code incorrect. Vérifiez l'heure de votre téléphone.");
  await prisma.user.update({ where: { id: s.userId }, data: { totpEnabled: true } });
  await log("UPDATE", "USER", s.userId, { field: "2fa", enabled: true });
  return { ok: true };
});

export const DELETE = route({ allowEmployee: true }, async ({ s, log }) => {
  const m = await prisma.organization.findUnique({ where: { id: s.org.id } });
  if (m?.require2FAForAdmins && s.role === "RH") fail(400, "La double authentification est obligatoire pour les administrateurs de cette organisation.");
  await prisma.user.update({ where: { id: s.userId }, data: { totpEnabled: false, totpSecret: null } });
  await log("UPDATE", "USER", s.userId, { field: "2fa", enabled: false });
  return { ok: true };
});
