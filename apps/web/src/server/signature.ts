import "server-only";
import { createHash, randomInt } from "node:crypto";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { readObject, putBuffer } from "./storage";
import { getBranding, legalLine } from "./branding";

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashOtp = (code: string, id: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");

export type SignMethod = "otp" | "draw";
/** Where the handwritten signature is drawn on the document. */
export type Placement = "bottom-right" | "bottom-left" | "certificate";
export const PLACEMENTS: Record<Placement, string> = {
  "bottom-right": "Dernière page, en bas à droite",
  "bottom-left": "Dernière page, en bas à gauche",
  certificate: "Page de certificat uniquement",
};

/** Decode and validate a canvas data URL ("data:image/png;base64,…"). */
export function decodeSignatureImage(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[1]!, "base64");
  if (bytes.length < 200 || bytes.length > 600_000) return null;
  // PNG magic number
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return bytes;
}

/**
 * Simple advanced e-signature: stamp each page, optionally draw the handwritten signature,
 * and append a certificate page with the audit trail.
 */
export async function stampSignedPdf(o: {
  fileUrl: string; organizationId: string; requestId: string; signer: string; email: string; ip: string | null; when: Date; title: string; timeZone: string;
  method: SignMethod; signatureImage?: Uint8Array | null; placement?: Placement;
}) {
  const key = o.fileUrl.replace(/^\/api\/files\//, "");
  const src = await readObject(key);
  if (!src) throw new Error("Document original introuvable.");
  const originalHash = createHash("sha256").update(src.body).digest("hex");
  const brand = await getBranding(o.organizationId);
  const pdf = await PDFDocument.load(src.body);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const when = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "medium", timeZone: o.timeZone }).format(o.when);
  const sigImg = o.signatureImage ? await pdf.embedPng(o.signatureImage) : null;
  const pages = pdf.getPages();

  for (const page of pages) {
    // Vertical stamp in the right margin: never overlaps the document's own header/footer.
    const { width, height } = page.getSize();
    page.drawText(`Signé électroniquement par ${o.signer} le ${when} — ${brand.name} · réf. ${o.requestId}`, { x: width - 8, y: 40, size: 6.5, font, color: rgb(0.08, 0.5, 0.55), rotate: degrees(90), maxWidth: height - 80 });
  }

  // Handwritten signature block on the last page.
  if (sigImg && o.placement && o.placement !== "certificate") {
    const page = pages[pages.length - 1]!;
    const { width } = page.getSize();
    const boxW = 190, boxH = 82;
    const x = o.placement === "bottom-left" ? 40 : width - boxW - 40;
    const y = 44;
    page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), opacity: 0.92, borderColor: rgb(0.08, 0.5, 0.55), borderWidth: 0.6 });
    const dims = sigImg.scaleToFit(boxW - 16, boxH - 28);
    page.drawImage(sigImg, { x: x + (boxW - dims.width) / 2, y: y + 20, width: dims.width, height: dims.height });
    page.drawText(o.signer, { x: x + 8, y: y + 10, size: 7.5, font: bold, color: rgb(0.08, 0.13, 0.12) });
    page.drawText(new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: o.timeZone }).format(o.when), { x: x + 8, y: y + 3, size: 6, font, color: rgb(0.4, 0.45, 0.43) });
  }

  const cert = pdf.addPage([595, 842]);
  cert.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(0.043, 0.165, 0.184) });
  let titleX = 40;
  if (brand.logo) {
    const logo = brand.logo.format === "png" ? await pdf.embedPng(brand.logo.data) : await pdf.embedJpg(brand.logo.data);
    const d = logo.scaleToFit(46, 46);
    cert.drawRectangle({ x: 36, y: 783, width: 54, height: 50, color: rgb(1, 1, 1) });
    cert.drawImage(logo, { x: 40 + (46 - d.width) / 2, y: 785 + (46 - d.height) / 2, width: d.width, height: d.height });
    titleX = 104;
  }
  cert.drawText("Certificat de signature électronique", { x: titleX, y: 806, size: 17, font: bold, color: rgb(1, 1, 1) });
  cert.drawText(brand.name, { x: titleX, y: 789, size: 9, font, color: rgb(0.95, 0.65, 0.25) });
  const legal = legalLine(brand);
  const rows: [string, string][] = [
    ["Document", o.title], ["Organisation", brand.name], ...(legal ? [["Coordonnées", legal] as [string, string]] : []), ["Signataire", o.signer], ["E-mail du signataire", o.email], ["Date et heure", when],
    ["Adresse IP", o.ip ?? "inconnue"],
    ["Méthode", o.method === "draw" ? "Signature manuscrite tracée à l'écran (session authentifiée)" : "Code à usage unique envoyé par e-mail (OTP)"],
    ["Référence", o.requestId], ["Empreinte SHA-256 du document original", originalHash],
  ];
  let y = 730;
  for (const [k, v] of rows) {
    cert.drawText(k, { x: 40, y, size: 9, font, color: rgb(0.4, 0.45, 0.43) });
    const chunks = v.match(/.{1,64}/g) ?? [""];
    chunks.forEach((c, i) => cert.drawText(c, { x: 230, y: y - i * 13, size: 10, font: k.startsWith("Empreinte") ? font : bold, color: rgb(0.08, 0.13, 0.12) }));
    y -= 22 + (chunks.length - 1) * 13;
  }
  if (sigImg) {
    cert.drawText("Signature", { x: 40, y: y - 6, size: 9, font, color: rgb(0.4, 0.45, 0.43) });
    const d = sigImg.scaleToFit(220, 90);
    cert.drawRectangle({ x: 228, y: y - 100, width: 232, height: 100, borderColor: rgb(0.85, 0.87, 0.85), borderWidth: 0.6 });
    cert.drawImage(sigImg, { x: 234, y: y - 95, width: d.width, height: d.height });
    y -= 115;
  }
  cert.drawText(o.method === "draw" ? "La signature a été tracée par le signataire, connecté à son compte personnel." : "La signature a été apposée après vérification d'un code personnel envoyé à l'adresse e-mail du signataire.", { x: 40, y: y - 20, size: 8.5, font, color: rgb(0.4, 0.45, 0.43) });

  const bytes = await pdf.save();
  const signedKey = `${o.organizationId}/signatures/${o.requestId}-signe.pdf`;
  await putBuffer(signedKey, bytes, "application/pdf");
  if (o.signatureImage) await putBuffer(`${o.organizationId}/signatures/${o.requestId}-manuscrite.png`, o.signatureImage, "image/png");
  return { signedUrl: `/api/files/${signedKey}`, originalHash };
}
