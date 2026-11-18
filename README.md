# YGHR

**Vos équipes, leur temps, leur paie — en un seul endroit.**

YGHR is a multi-tenant HR SaaS for clinics, hospitals and SMEs in Morocco. It covers biometric time clocks, shift planning that checks labour rules, leave management and Moroccan payroll (CNSS / AMO / IR). The UI is in French. The full product brief is in [`YGHR-README.md`](YGHR-README.md).

## Quick start (Docker)

```bash
cp .env.example .env          # then set JWT_SECRET and REALTIME_INTERNAL_SECRET (openssl rand -base64 48)
docker compose up -d --build  # postgres, redis, minio, mailpit, migrate+seed, web, realtime, worker
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| E-mails (Mailpit) | http://localhost:8025 |
| Files (MinIO console) | http://localhost:9001 (`minioadmin` / `minioadmin`) |

Demo accounts (password `Demo2026!yghr`, or `SEED_PASSWORD`):

| Role | E-mail | Space |
|---|---|---|
| RH (admin) | `rh@demo.yghr.ma` | `/clinique-demo/rh` |
| Team lead | `chef@demo.yghr.ma` | `/clinique-demo/chef` |
| Employee | `salarie@demo.yghr.ma` | `/clinique-demo/salarie` |

The seed keeps existing data. Set `SEED_RESET=1` to recreate the demo organisation.

## Production hosting

To put YGHR online with automatic HTTPS, follow [`deploy/DEPLOY.md`](deploy/DEPLOY.md). It covers a VPS, `docker-compose.prod.yml` with Caddy, `pnpm org:create` for your real organisation, and backups.

On **Microsoft Azure**, follow [`deploy/AZURE.md`](deploy/AZURE.md): an Azure VM created with the Azure CLI, a free `*.cloudapp.azure.com` name or your own domain, and Azure Backup.

## Local development (without Docker)

Requirements: Node 22+ and pnpm 11.

```bash
pnpm install
cp .env.example .env               # DATABASE_URL=postgresql://yghr:yghr@localhost:54329/yghr for the embedded DB
pnpm db:local                      # terminal 1: PostgreSQL from the embedded-postgres package (./.pgdata)
pnpm db:migrate:deploy             # create the schema
SEED_DEMO=1 pnpm db:seed           # plans, fiscal rules, holidays, demo clinic (+25 employees, planning, punches, payroll)
pnpm dev:web                       # terminal 2: http://localhost:3000
pnpm --filter @yghr/realtime dev   # terminal 3: Socket.IO on :3001 (live presence, notifications)
pnpm --filter @yghr/worker dev     # optional, needs Redis: device polling, daily jobs
```

Without SMTP, invitation, reset and signature links and codes are printed in the web server log. Without MinIO, `STORAGE_DRIVER=local` stores files in `apps/web/.uploads`.

## Tests

```bash
pnpm --filter @yghr/core test      # 63 unit tests: time, anomalies, attendance, leave, payroll fixtures
pnpm --filter @yghr/web test:e2e   # Playwright against a running, seeded app (6 flows)
pnpm typecheck
```

## Architecture

```
apps/web        Next.js 16 (App Router): UI + REST API (/api/*) + ADMS endpoints (/iclock/*)
apps/realtime   Socket.IO server, rooms org:{id} and user:{id}; POST /internal/emit (shared secret)
apps/worker     BullMQ jobs: LAN device polling, heartbeat, nightly attendance close, anomaly scan, daily digest
packages/core   Pure business logic with Vitest tests (time, rules engine, attendance, leave, payroll, permissions)
packages/db     Prisma 7 schema, migrations, seed, and domain services (attendance recompute, payroll, punches, devices)
packages/ui     YGHR design system (tokens, Button, Field, Modal, SideSheet, KpiCard, EmptyState, logo…)
```

Key principles:

- **Tenant isolation.** Every query is scoped by `organizationId` taken from the session, never from the client. Team-lead queries are also limited to their subordinates (`scopeEmployeeIds`), and granular rights are checked server-side with `can(actor, permission, targetEmployeeId)`.
- **Auth.** argon2id passwords, a 15-minute access JWT plus a rotating refresh token (httpOnly cookies), optional TOTP 2FA, 7-day invite and reset links, rate-limited login, and an Origin check on every cookie-authenticated write (CSRF).
- **Audit.** Every write goes through `route()` and is logged (action, entity, before/after, IP, user agent). Rule changes also feed the *Historique* tab.
- **Labour and payroll values are data.** `FiscalRuleVersion` (CNSS, AMO, IR scale, professional expenses, SMIG, overtime premiums) and `WorkRule` rows are editable; a payroll period keeps the version it used.
- **Time.** All computations use the organisation's wall-clock time (`Africa/Casablanca` by default); a shift whose end is at or before its start ends the next day.

## Configuration notes

- Moroccan payroll values are seeded from the LF 2025 scale and must be confirmed with your accountant, in particular professional expenses and Islamic holiday dates.
- ZKTeco LAN devices are read with `zkteco-js` (TCP 4370). Devices protected by a communication password should use ADMS mode, where the device pushes to `http://<host>:<port>/iclock/cdata` and only registered serial numbers are accepted.
- Web Push requires VAPID keys: `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
- Design decisions are marked with `// DECISION:` comments in the code.
