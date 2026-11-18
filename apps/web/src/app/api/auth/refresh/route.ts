import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/server/auth";
import { clientIp } from "@/server/api";

/** Browser navigation: rotate the refresh token then go back to `next`. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const claims = await refreshSession({ ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  const url = req.nextUrl.clone();
  url.search = "";
  if (!claims) {
    url.pathname = "/login";
    url.searchParams.set("next", safe);
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(claims.org ? safe : "/select-org", req.url));
}

/** fetch() after a 401. */
export async function POST(req: NextRequest) {
  const claims = await refreshSession({ ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  if (!claims) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
