import { prisma } from "@yghr/db";
import { fail, route } from "@/server/api";
import { saveUpload } from "@/server/storage";

/** Upload the organisation logo (PNG or JPG, 1 MB max) used on documents. */
export const POST = route({ rhOnly: true }, async ({ s, req, log }) => {
  const file = (await req.formData()).get("logo");
  if (!(file instanceof File) || !file.size) fail(400, "Choisissez une image.");
  const f = file as File;
  if (f.type !== "image/png" && f.type !== "image/jpeg") fail(400, "Format accepté : PNG ou JPG.");
  if (f.size > 1024 * 1024) fail(400, "Logo trop lourd (1 Mo maximum).");
  const saved = await saveUpload(s.org.id, "branding", f);
  await prisma.organization.update({ where: { id: s.org.id }, data: { logoUrl: saved.url } });
  await log("UPDATE", "ORGANIZATION", s.org.id, { logo: saved.url });
  return { logoUrl: saved.url };
});

export const DELETE = route({ rhOnly: true }, async ({ s, log }) => {
  await prisma.organization.update({ where: { id: s.org.id }, data: { logoUrl: null } });
  await log("UPDATE", "ORGANIZATION", s.org.id, { logo: null });
  return { ok: true };
});
