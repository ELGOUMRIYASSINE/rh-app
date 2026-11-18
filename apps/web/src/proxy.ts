import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "yghr_at";
const REFRESH_COOKIE = "yghr_rt";
const SPACE_RE = /^\/[a-z0-9-]+\/(rh|chef|salarie)(\/|$)/;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Endpoints called by devices / kiosks, without cookies. */
const CSRF_EXEMPT = [/^\/iclock\//, /^\/api\/kiosk\//];

async function validAccess(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { issuer: "yghr" });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // CSRF: cookie-authenticated writes must come from our own origin.
  if (MUTATING.has(req.method) && pathname.startsWith("/api/") && !CSRF_EXEMPT.some((r) => r.test(pathname))) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "Origine de la requête refusée." }, { status: 403 });
    }
  }

  const headers = new Headers(req.headers);
  headers.set("x-yghr-path", pathname + search);

  if (SPACE_RE.test(pathname) || pathname === "/select-org") {
    const ok = await validAccess(req.cookies.get(ACCESS_COOKIE)?.value);
    if (!ok) {
      const next = encodeURIComponent(pathname + search);
      const url = req.nextUrl.clone();
      url.search = "";
      if (req.cookies.get(REFRESH_COOKIE)) {
        url.pathname = "/api/auth/refresh";
        url.search = `?next=${next}`;
      } else {
        url.pathname = "/login";
        url.search = `?next=${next}`;
      }
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"],
};
