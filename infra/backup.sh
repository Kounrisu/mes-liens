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
# Le conteneur tourne en root EXPRÈS : l'API écrit ses captures via un fichier temporaire en mode 600 (lisible par son seul utilisateur),
# un utilisateur ordinaire ne pourrait pas toutes les archiver. L'archive est ensuite rendue à l'utilisateur courant, en 600.
# ATTENTION — le volume est monté sur /vol, PAS sur /data : l'image caddy déclare déjà /data ; monter un volume VIDE dessus y copie le
# contenu ET le propriétaire (root) de l'image, ce qui empêchait l'API d'écrire ses captures (régression constatée au premier essai).
docker run --rm --pull=never -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v mes-liens_screenshots:/vol:ro -v "$DEST":/out caddy:2-alpine \
  sh -c "tar czf /out/screenshots-$STAMP.tgz.tmp -C /vol . && chown \$HOST_UID:\$HOST_GID /out/screenshots-$STAMP.tgz.tmp && chmod 600 /out/screenshots-$STAMP.tgz.tmp"
mv "$DEST/screenshots-$STAMP.tgz.tmp" "$DEST/screenshots-$STAMP.tgz"

# Rétention : supprime uniquement les fichiers de sauvegarde de CE dossier plus vieux que 14 jours.
find "$DEST" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'screenshots-*.tgz' \) -mtime +14 -delete
echo "Sauvegarde OK : $DEST ($STAMP)"
