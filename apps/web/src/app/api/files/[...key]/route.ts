import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/server/context";
import { readObject } from "@/server/storage";

/** Serve a stored file only to members of the owning organisation. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const key = (await params).key.join("/");
  if (!key.startsWith(`${s.org.id}/`)) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  const obj = await readObject(key);
  if (!obj) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return new Response(obj.body as unknown as BodyInit, { headers: { "content-type": obj.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
