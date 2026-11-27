import { defineConfig, devices } from "@playwright/test";

/** E2E against a running stack seeded with SEED_DEMO=1 (pnpm db:seed). Start with `pnpm dev` first. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "fr-FR", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
