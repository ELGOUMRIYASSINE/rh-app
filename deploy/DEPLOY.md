# Deploying YGHR on a VPS

This puts YGHR online at `https://your-domain` with automatic HTTPS. It takes about 30 minutes the first time.

## What you need

| Item | Recommendation | Approx. cost |
|---|---|---|
| A VPS with **4 GB RAM**, 2 vCPU, 40 GB disk, Ubuntu 24.04 | Hetzner CX22, Contabo VPS S, OVH VPS, DigitalOcean 4 GB | €5–25 / month |
| A domain or subdomain | e.g. `rh.yourclinic.ma` (any registrar) | ~€10 / year |
| An SMTP account, for invitation and password e-mails | Brevo (free up to 300/day), Mailjet, or your mail provider | free to start |

2 GB of RAM is not enough to build the app. If you must use a 2 GB server, add swap (step 2).

## 1. Point the domain to the server

At your registrar, create an **A record** `rh.yourclinic.ma` → your server's IPv4 address. Wait until `ping rh.yourclinic.ma` answers with that IP (usually a few minutes).

## 2. Prepare the server

```bash
ssh root@YOUR_SERVER_IP

# Docker
curl -fsSL https://get.docker.com | sh

# Firewall: SSH + web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# (Only on 2 GB servers) 4 GB swap so the build does not run out of memory
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Copy the project

Recommended: push the project to a **private** GitHub or GitLab repository, then:

```bash
git clone https://github.com/YOUR_ACCOUNT/yghr.git /opt/yghr
```

Without git, run this from your own computer instead:

```bash
rsync -av --exclude node_modules --exclude .next --exclude .pgdata --exclude .uploads --exclude .env \
  /media/yassine/ylg/devhome/projects/YGRH/ root@YOUR_SERVER_IP:/opt/yghr/
```

## 4. Configure

```bash
cd /opt/yghr
cp deploy/.env.production.example .env
nano .env
```

Fill in every value:

- `DOMAIN` and `ACME_EMAIL` (Let's Encrypt uses the e-mail for certificate notices).
- `JWT_SECRET`, `REALTIME_INTERNAL_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`: generate each one with `openssl rand -base64 48 | tr -d '/+=' | cut -c1-48`.
- The SMTP settings, so that invitations and password resets reach people's inboxes.

## 5. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # wait until web is "healthy" (the first build takes 5–10 min)
```

This creates the database schema and the reference data (plans, Moroccan fiscal rules, public holidays). It does **not** create the demo clinic, so no public demo password exists in production.

## 6. Create your organisation

```bash
docker compose -f docker-compose.prod.yml exec web pnpm org:create \
  --name "Clinique Al Amal" --slug clinique-al-amal \
  --email directrice@alamal.ma --first Samira --last Alaoui --plan Entreprise
```

It prints a link valid for 7 days. Open it (or send it to the administrator) to choose the password, then sign in at `https://your-domain/login`.

## 7. Backups (do not skip)

```bash
crontab -e
# add this line: daily database dump at 02:00, 14 days kept in /opt/yghr/backups
0 2 * * * /opt/yghr/deploy/backup.sh >> /var/log/yghr-backup.log 2>&1
```

Also copy `/opt/yghr/backups` off the server regularly (to another server, Backblaze, etc.).

To restore a dump:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U yghr -d yghr --clean < backups/yghr-2026-11-16.dump
```

## Updating to a new version

```bash
cd /opt/yghr && git pull        # or rsync again
docker compose -f docker-compose.prod.yml up -d --build   # migrations run automatically
```

## Biometric clocks (ZKTeco ADMS)

On each device, open *Communication → Cloud server*. Set the server address to your domain and the port to **80**. Then register the device's serial number in **Pointeuses → Avancé**. Port 80 stays open only for `/iclock/*`; everything else is redirected to HTTPS. LAN mode (port 4370) works only if the server can reach the device's network, for example over a VPN.

## Useful commands

```bash
docker compose -f docker-compose.prod.yml logs -f web          # application logs
docker compose -f docker-compose.prod.yml logs -f caddy        # HTTPS / certificate issues
docker compose -f docker-compose.prod.yml restart web
docker compose -f docker-compose.prod.yml down                 # stop (data is kept in Docker volumes)
```

## Troubleshooting

- **Certificate not issued:** the domain must already point to the server, and ports 80/443 must be open (`ufw status`). Check `logs caddy`.
- **Build killed / out of memory:** add swap (step 2) or use a 4 GB server.
- **No e-mails arrive:** check the SMTP values in `.env`, then run `docker compose -f docker-compose.prod.yml restart web worker`.
- **"Hors ligne" pill in the app:** check `logs realtime`. Socket.IO is served on the same domain under `/socket.io`.
