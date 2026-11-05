#!/bin/sh
# Sauvegarde de mes-liens : base PostgreSQL (pg_dump) + captures d'écran, rétention 14 jours.
# À lancer par cron / timer APRÈS accord (non installé par défaut). Lecture seule sur les données, écrit seulement dans $DEST.
set -eu

DEST="${BACKUP_DIR:-$HOME/mes-liens-backups}"
STAMP="$(date +%F-%H%M)"
umask 077
mkdir -p "$DEST"

# Base : format « custom » (restauration sélective possible avec pg_restore). Écriture dans un fichier temporaire puis renommage :
# une sauvegarde interrompue ne laisse jamais un fichier incomplet qui ressemblerait à une bonne.
docker exec mesliens-db pg_dump -U mesliens -Fc mesliens > "$DEST/db-$STAMP.dump.tmp"
mv "$DEST/db-$STAMP.dump.tmp" "$DEST/db-$STAMP.dump"

# Captures : lecture seule du volume (image du proxy déjà présente sur le serveur, jamais téléchargée ici).
docker run --rm --pull=never -v mes-liens_screenshots:/data:ro -v "$DEST":/out caddy:2-alpine \
  tar czf "/out/screenshots-$STAMP.tgz.tmp" -C /data .
mv "$DEST/screenshots-$STAMP.tgz.tmp" "$DEST/screenshots-$STAMP.tgz"

# Rétention : supprime uniquement les fichiers de sauvegarde de CE dossier plus vieux que 14 jours.
find "$DEST" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'screenshots-*.tgz' \) -mtime +14 -delete
echo "Sauvegarde OK : $DEST ($STAMP)"
