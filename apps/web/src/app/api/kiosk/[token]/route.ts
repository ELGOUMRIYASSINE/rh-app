import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma, ingestPunch, formatLocalTime } from "@yghr/db";
import { verifyPassword } from "@/server/auth";
import { clientIp, errorResponse } from "@/server/api";
import { TabletRules } from "@/server/tablet-rules";
import { emit } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";
import { saveUpload } from "@/server/storage";
import { audit } from "@/server/audit";

function ipAllowed(ip: string | null, ranges: string[]) {
  if (!ranges.length) return true;
  if (!ip) return false;
  return ranges.some((r) => (r.endsWith("*") ? ip.startsWith(r.slice(0, -1)) : r.includes("/") ? ip.startsWith(r.split("/")[0]!.split(".").slice(0, Math.floor(Number(r.split("/")[1]) / 8)).join(".")) : ip === r));
}
function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3, t = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * t) / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lng - a.lng) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Kiosk clock-in. Authenticated by the tablet token + the employee's PIN (no session cookie). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = clientIp(req);
    if (!rateLimit(`kiosk:${token}:${ip}`, 30, 60_000).ok) return NextResponse.json({ error: "Trop de tentatives, patientez une minute." }, { status: 429 });
    const tablet = await prisma.tablet.findUnique({ where: { token }, include: { organization: true } });
    if (!tablet || !tablet.active) return NextResponse.json({ error: "Tablette non reconnue." }, { status: 401 });
    const rules = TabletRules.parse(tablet.organization.tabletRules ?? {});
    if (!ipAllowed(ip, rules.allowedIps)) return NextResponse.json({ error: "Cette tablette n'est pas sur le réseau autorisé." }, { status: 403 });
    const form = await req.formData();
    const { pin, lat, lng } = z.object({ pin: z.string().regex(/^\d{4,6}$/, "Code à 4–6 chiffres"), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }).parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
    if (rules.geofence && (lat === undefined || lng === undefined || distance(rules.geofence, { lat, lng }) > rules.geofence.radiusMeters)) return NextResponse.json({ error: "Position hors de la zone de pointage autorisée." }, { status: 403 });
    const photo = form.get("photo");
    if (rules.photoRequired && !(photo instanceof File && photo.size)) return NextResponse.json({ error: "La photo est obligatoire." }, { status: 400 });
    const candidates = await prisma.employee.findMany({ where: { organizationId: tablet.organizationId, status: "ACTIVE", kioskPin: { not: null }, ...(tablet.centreId ? { OR: [{ centreId: tablet.centreId }, { centreId: null }] } : {}) }, select: { id: true, firstName: true, lastName: true, kioskPin: true } });
    let emp: (typeof candidates)[number] | undefined;
    for (const c of candidates) if (await verifyPassword(c.kioskPin!, pin)) { emp = c; break; }
    if (!emp) {
      await audit({ organizationId: tablet.organizationId, userId: null, action: "LOGIN_FAILED", entity: "KIOSK", entityId: tablet.id, details: { reason: "PIN" }, ip, userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ error: "Code inconnu. Réessayez." }, { status: 401 });
    }
    const saved = photo instanceof File && photo.size ? await saveUpload(tablet.organizationId, "kiosk", photo).catch(() => null) : null;
    const p = await ingestPunch(prisma, { organizationId: tablet.organizationId, employeeId: emp.id, timestamp: new Date(), source: "TABLET", rawPayload: { tabletId: tablet.id, photo: saved?.url ?? null, lat, lng } });
    await prisma.tablet.update({ where: { id: tablet.id }, data: { lastSeenAt: new Date() } });
    if (p) await emit(tablet.organizationId, "punch:new", { id: p.id, name: `${emp.firstName} ${emp.lastName}`, at: p.timestamp.toISOString(), device: tablet.name });
    return NextResponse.json({ ok: true, name: emp.firstName, time: formatLocalTime(new Date(), tablet.organization.timezone) });
  } catch (e) {
    return errorResponse(e);
  }
}
