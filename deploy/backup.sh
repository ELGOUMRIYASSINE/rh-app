#!/bin/sh
# Daily PostgreSQL backup, keeps 14 days.  Cron:  0 2 * * *  /opt/yghr/deploy/backup.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U yghr -Fc yghr > "backups/yghr-$(date +%F).dump"
find backups -name 'yghr-*.dump' -mtime +14 -delete
echo "backup ok: backups/yghr-$(date +%F).dump"
