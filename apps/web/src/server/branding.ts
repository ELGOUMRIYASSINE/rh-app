import "server-only";
import { prisma } from "@yghr/db";
import { readObject } from "./storage";

export interface Branding {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  ice: string | null;
  cnssEmployerNumber: string | null;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
}

/** Organisation identity printed on PDFs (payslips, planning, signature certificates). */
export async function getBranding(organizationId: string): Promise<Branding> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  let logo: Branding["logo"] = null;
  if (o.logoUrl) {
    const obj = await readObject(o.logoUrl.replace(/^\/api\/files\//, ""));
    if (obj && (obj.contentType === "image/png" || obj.contentType === "image/jpeg")) logo = { data: Buffer.from(obj.body), format: obj.contentType === "image/png" ? "png" : "jpg" };
  }
  return { name: o.name, address: o.address, phone: o.phone, email: o.contactEmail, ice: o.ice, cnssEmployerNumber: o.cnssEmployerNumber, logo };
}

/** "ICE 00123… · CNSS 123… · 05 22 …" */
export function legalLine(b: Branding): string {
  return [b.address, b.phone, b.ice && `ICE ${b.ice}`, b.cnssEmployerNumber && `CNSS ${b.cnssEmployerNumber}`].filter(Boolean).join(" · ");
}

/** Public, cache-busted URL of the clinic logo, or null when none is set. */
export function logoSrc(slug: string, logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const v = logoUrl.split("/").pop()?.replace(/\.[a-z]+$/, "") ?? "1";
  return `/api/public/logo/${encodeURIComponent(slug)}?v=${v}`;
}
