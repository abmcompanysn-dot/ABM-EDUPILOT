#!/bin/sh
# Sauvegarde nocturne de la base (à placer dans la crontab du serveur) :
#   15 2 * * * /opt/edupilot/deploy/backup.sh >> /var/log/edupilot-backup.log 2>&1
# Copiez ensuite le dossier backups hors du serveur (rclone vers Backblaze ou S3).
set -eu
cd "$(dirname "$0")"
mkdir -p ../backups
file="../backups/edupilot-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T postgres pg_dump -U edupilot --clean --if-exists edupilot | gzip > "$file"
find ../backups -name 'edupilot-*.sql.gz' -mtime +30 -delete
echo "$(date -Iseconds) sauvegarde OK : $file ($(du -h "$file" | cut -f1))"
