# Hosting YGHR on Microsoft Azure

This guide puts YGHR online at `https://your-domain` on Azure with automatic HTTPS. It uses one Azure virtual machine that runs the whole production stack from `docker-compose.prod.yml`:

```
Internet ──► Azure VM (Ubuntu 24.04)
               └─ Caddy :80/:443 (HTTPS, Let's Encrypt)
                    ├─ web       Next.js app          :3000
                    ├─ realtime  Socket.IO /socket.io :3001
                    ├─ worker    background jobs (e-mails, reminders)
                    ├─ postgres  database      (private)
                    ├─ redis     job queue     (private)
                    └─ minio     uploaded files, logos, signed PDFs (private)
```

Allow about 45 minutes the first time.

> **Why one VM and not App Service or Container Apps?** YGHR has five cooperating services, a WebSocket server on the same domain, and a plain-HTTP endpoint for ZKTeco clocks. A VM runs all of that unchanged, costs the least, and keeps every piece of data in one place. Moving to Azure managed services later is covered at the end.

---

## What you need

| Item | Recommendation | Approx. cost |
|---|---|---|
| An Azure subscription | [azure.microsoft.com/free](https://azure.microsoft.com/free): the free account includes credit for the first month | — |
| A VM with **4 GB RAM**, 2 vCPU | `Standard_B2s` or `Standard_B2als_v2`, 64 GB disk | ~30–45 € / month |
| A domain (optional) | e.g. `rh.yourclinic.ma`. Without one, Azure gives you a free `*.cloudapp.azure.com` name that also gets HTTPS | ~10 € / year |
| An SMTP account | Brevo (free up to 300/day), Mailjet, Azure Communication Services Email, or your mail provider | free to start |
| Azure CLI on your computer | [Install the Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), then run `az login` | free |

**Region:** Azure has no Moroccan region. The closest ones are **France Central** (Paris) and **Spain Central** (Madrid). This guide uses `francecentral`.

> If you prefer clicking to typing commands, every `az` step below has a portal equivalent (*Virtual machines → Create*). Use the same values.

---

## 1. Create the virtual machine

Run these commands on **your own computer**. Choose your own values for `yghr-rg` (resource group), `yghr-vm` (VM name) and `yghr-alamal` (DNS label; it must be unique in the region).

```bash
az login

# A resource group holds everything for YGHR, so it is easy to find, bill and delete
az group create --name yghr-rg --location francecentral

# The VM: Ubuntu 24.04, 2 vCPU / 4 GB, 64 GB disk, static public IP + free DNS name
az vm create \
  --resource-group yghr-rg \
  --name yghr-vm \
  --image Ubuntu2404 \
  --size Standard_B2s \
  --os-disk-size-gb 64 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --public-ip-address-dns-name yghr-alamal

# Open the web ports (SSH 22 is opened automatically)
az vm open-port --resource-group yghr-rg --name yghr-vm --port 80  --priority 1010
az vm open-port --resource-group yghr-rg --name yghr-vm --port 443 --priority 1020
```

The output shows `publicIpAddress` and `fqdn`, for example `yghr-alamal.francecentral.cloudapp.azure.com`. Note both.

**Recommended:** allow SSH only from your own IP address:

```bash
az network nsg rule update --resource-group yghr-rg --nsg-name yghr-vmNSG \
  --name default-allow-ssh --source-address-prefixes "$(curl -s https://api.ipify.org)/32"
```

(If your IP changes, run it again. You can also use the Azure portal's *Connect → Bastion* button.)

## 2. Point your domain to the VM

- **Using your own domain:** at your registrar, create an **A record** `rh.yourclinic.ma` → the `publicIpAddress` from step 1. Wait until `ping rh.yourclinic.ma` answers with that IP.
- **No domain:** use the Azure name (`yghr-alamal.francecentral.cloudapp.azure.com`) as your domain. It works immediately, and you can switch to your own domain later by changing `DOMAIN` in `.env` and restarting.

## 3. Prepare the server

```bash
ssh azureuser@YOUR_PUBLIC_IP

# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker azureuser
exit          # log out and back in so the docker group applies
ssh azureuser@YOUR_PUBLIC_IP
docker version   # should print Client and Server versions

sudo mkdir -p /opt/yghr && sudo chown azureuser:azureuser /opt/yghr
```

The Azure network security group is the firewall, so you don't need `ufw`.

## 4. Copy the project to the VM

Recommended: push the project to a **private** GitHub, GitLab or Azure DevOps repository, then on the VM:

```bash
git clone https://github.com/YOUR_ACCOUNT/yghr.git /opt/yghr
```

Without git, run this from **your own computer**:

```bash
rsync -av --exclude node_modules --exclude .next --exclude .pgdata --exclude .uploads --exclude .env \
  ./ azureuser@YOUR_PUBLIC_IP:/opt/yghr/
```

## 5. Configure

```bash
cd /opt/yghr
cp deploy/.env.production.example .env
nano .env
```

Fill in every value:

| Variable | Value |
|---|---|
| `DOMAIN` | `rh.yourclinic.ma` or `yghr-alamal.francecentral.cloudapp.azure.com` (no `https://`) |
| `ACME_EMAIL` | your e-mail; Let's Encrypt sends certificate notices there |
| `JWT_SECRET`, `REALTIME_INTERNAL_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` | generate each one separately with `openssl rand -base64 48 \| tr -d '/+=' \| cut -c1-48` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your SMTP provider's values. **Use port 587**: Azure blocks outgoing port 25 |

Keep a copy of `.env` in a password manager. Without `JWT_SECRET` and the database password you cannot restore a backup.

## 6. Start YGHR

```bash
cd /opt/yghr
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps     # wait until "web" shows (healthy); the first build takes 5–10 min
```

This builds the app and creates the database schema and the reference data (plans, Moroccan fiscal rules, public holidays). It then obtains the HTTPS certificate. It does **not** create the demo clinic, so the demo password does not exist in production.

Open `https://YOUR_DOMAIN`. You should see the login page with a valid padlock.

## 7. Create the first clinic

### Your owner account (console)

```bash
docker compose -f docker-compose.prod.yml exec web pnpm platform:admin --email you@yourcompany.ma --first Your --last Name
```

It prints a link to choose your password. Then sign in: you land on the console at `https://YOUR_DOMAIN/admin`, where you create clinics (client or demo/trial), manage their accounts, answer support requests and see incidents. `pnpm org:create` still works from the command line (`--demo` adds demo data).

### Or from the command line


```bash
docker compose -f docker-compose.prod.yml exec web pnpm org:create \
  --name "Clinique Al Amal" --slug clinique-al-amal \
  --email directrice@alamal.ma --first Samira --last Alaoui --plan Entreprise
```

The command prints a link valid for 7 days. The administrator opens it to choose a password, signs in at `https://YOUR_DOMAIN/login`, then sets the clinic's name and logo in **Paramètres → Identité de l'établissement**.

Repeat the command for each new clinic; each one is a separate organisation with its own data, name and logo.

## 8. Backups (do not skip)

Use two layers: daily database dumps on the VM, plus Azure Backup of the whole VM. The VM backup also covers uploaded files, logos and signed PDFs.

**a. Daily database dump** (on the VM):

```bash
chmod +x /opt/yghr/deploy/backup.sh
crontab -e
# add this line: dump at 02:00, keeps 14 days in /opt/yghr/backups
0 2 * * * /opt/yghr/deploy/backup.sh >> /home/azureuser/yghr-backup.log 2>&1
```

**b. Azure Backup of the VM** (on your computer; daily snapshot, kept 30 days):

```bash
az backup vault create --resource-group yghr-rg --name yghr-vault --location francecentral
az backup protection enable-for-vm --resource-group yghr-rg --vault-name yghr-vault \
  --vm yghr-vm --policy-name DefaultPolicy
```

(Portal: *VM → Backup → Enable backup*.) To recover, restore the VM or its disk from the vault in the portal.

**Restore a single database dump:**

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U yghr -d yghr --clean < backups/yghr-2026-11-18.dump
```

## 9. Cost and monitoring

- **Budget alert:** portal → *Cost Management → Budgets → Add*. Set a monthly amount and an e-mail alert at 80 %.
- **Don't** enable VM auto-shutdown: employees clock in at night too.
- **Uptime alert (optional):** portal → *Application Insights → Availability → Add standard test* on `https://YOUR_DOMAIN/api/health`, with an e-mail alert.

---

## Updating to a new version

```bash
ssh azureuser@YOUR_PUBLIC_IP
cd /opt/yghr && git pull          # or rsync again from your computer
docker compose -f docker-compose.prod.yml up -d --build   # database migrations run automatically
```

## Biometric clocks (ZKTeco)

Once the site is online, the clocks at the clinic send their data **to** the server over the internet (ADMS mode). The server cannot reach into the clinic's network, so use ADMS for every clock.

1. In YGHR: **Pointeuses → Pointeuses → Avancé**, enter the clock's serial number (on the clock: *Menu → System info → Device info → Serial number*).
2. On the clock: *Menu → Communication → Cloud server / ADMS*. Set the server address to your domain, the port to **80**, and turn off "HTTPS" / "Domain name: No proxy".
3. Within a minute the clock shows **En ligne**. It then sends:
   - its information: firmware, IP, how many users, fingerprints and faces it holds, and how many clock-ins are stored;
   - **its users with their names**, card numbers and enrolled fingerprints and faces;
   - every new clock-in in real time, with its type (entrée, sortie, pause, heures sup) and how the person was identified.
4. **Pointeuses → Utilisateurs des pointeuses**: click **Associer automatiquement**. This links IDs to employees with the same name or matricule. Accept the suggestions, or create the missing employees from the names on the clock. Linked clock-ins feed presences and payroll automatically.
5. Older clock-ins: on the clock's card, use **⋯ → Récupérer tout l'historique**.

Port 80 stays open only for `/iclock/*`; everything else is redirected to HTTPS. Only serial numbers registered in YGHR are accepted. LAN mode (port 4370) works only if the server can reach the clinic's network, for example over a VPN.

## Useful commands (on the VM, in `/opt/yghr`)

```bash
docker compose -f docker-compose.prod.yml logs -f web        # application logs
docker compose -f docker-compose.prod.yml logs -f caddy      # HTTPS / certificate issues
docker compose -f docker-compose.prod.yml restart web worker
docker compose -f docker-compose.prod.yml down               # stop (data stays in Docker volumes)
df -h /                                                      # disk space
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser can't reach the site | Check that ports 80/443 are open: `az vm open-port …` (step 1), or portal → *VM → Networking*. |
| Certificate not issued / padlock error | The domain must already point to the VM's IP, and port 80 must be open. Check `logs caddy`. |
| `ssh` hangs | Your IP changed; run the `nsg rule update` command from step 1 again. |
| No e-mails arrive | Use SMTP port **587** (Azure blocks 25). Fix `.env`, then `docker compose -f docker-compose.prod.yml up -d`. |
| Build killed / out of memory | The VM needs 4 GB RAM. Resize it: `az vm resize -g yghr-rg -n yghr-vm --size Standard_B2s`. |
| "Hors ligne" pill in the app | Check `logs realtime`. Live updates are served on the same domain under `/socket.io`. |
| Disk full | Clean old images: `docker system prune -af` (volumes and data are kept). Or enlarge the disk in the portal. |

---

## Later: moving to Azure managed services

When you host many clinics or need high availability, you can move pieces out of the VM one at a time:

| Piece | Azure service | What changes |
|---|---|---|
| Database | **Azure Database for PostgreSQL – Flexible Server** (v17) | Point `DATABASE_URL` to it (add `?sslmode=require`) and remove the `postgres` service from the compose file. Gives managed backups and point-in-time restore. |
| Job queue | **Azure Cache for Redis** | Set `REDIS_URL=rediss://:KEY@NAME.redis.cache.windows.net:6380` and remove the `redis` service. |
| Files | Keep MinIO on the VM, or ask for an Azure Blob driver | Azure Blob Storage doesn't speak the S3 protocol that YGHR uses, so it needs a small code addition. |
| App containers | **Azure Container Apps** | Push the image to Azure Container Registry. Run `web`, `realtime` and `worker` as three apps. Set `NEXT_PUBLIC_REALTIME_URL` and `REALTIME_CORS_ORIGINS` because Socket.IO gets its own address. The ZKTeco clocks need an HTTP (non-HTTPS) ingress. |

Start with the database: it gives the biggest gain in safety for the smallest change.

## Deleting everything

This removes the VM, disk, IP and backups, and stops all billing. **Your data is lost**, so download a backup first.

```bash
az group delete --name yghr-rg
```
