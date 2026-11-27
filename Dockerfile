# YGHR — one image for web, realtime and worker (different commands in docker-compose).
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
COPY packages/ui/package.json packages/ui/
RUN DATABASE_URL=postgresql://build:build@localhost/build pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost/build pnpm --filter @yghr/db generate \
 && DATABASE_URL=postgresql://build:build@localhost/build JWT_SECRET=build-time-placeholder-secret-0123456789 pnpm --filter @yghr/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000 3001
CMD ["pnpm", "--filter", "@yghr/web", "start"]
