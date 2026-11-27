import { config } from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Load the monorepo root .env (Prisma 7 no longer loads .env automatically).
config({ path: path.resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
