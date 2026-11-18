import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";

// Single .env at the monorepo root.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

// Allow opening the dev server from this machine's LAN addresses (e.g. http://10.x.x.x:3000),
// otherwise Next 16 blocks its dev connection and the page keeps loading.
const lanHosts = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4").map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...lanHosts],
  transpilePackages: ["@yghr/core", "@yghr/db"],
  serverExternalPackages: ["argon2", "@prisma/client", "pg", "exceljs", "@react-pdf/renderer", "nodemailer", "web-push"],
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  poweredByHeader: false,
  // DECISION: the dev MCP server writes .next/dev/logs on every browser log; with the monorepo
  // Turbopack root that file is watched and causes a reload loop. YGHR does not need it.
  experimental: { mcpServer: false },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default nextConfig;
