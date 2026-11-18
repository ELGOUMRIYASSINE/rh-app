import { NextResponse } from "next/server";
import { prisma } from "@yghr/db";

/** Liveness + database readiness (used by Docker health checks). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
