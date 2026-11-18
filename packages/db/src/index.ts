import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __yghrPrisma?: PrismaClient };

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL manquant");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Shared client (one per process; survives Next.js hot reloads). */
function getClient(): PrismaClient {
  if (!globalForPrisma.__yghrPrisma) globalForPrisma.__yghrPrisma = createPrismaClient();
  return globalForPrisma.__yghrPrisma;
}
/** Lazily created so that importing this module never requires DATABASE_URL (e.g. at build time). */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = getClient() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

/** Decimal | number | null → number | null */
export function num(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : v.toNumber();
}

export * from "./tz";
export * from "./services/planning";
export * from "./services/attendance";
export * from "./services/payroll";
export * from "./services/punches";
export * from "./services/live";
export * from "./services/devices";
