#!/bin/bash
# À lancer SUR LE SERVEUR, de façon interactive (ssh -t) : enregistre les identifiants Google et l'adresse autorisée.
# Le secret client est saisi sans écho et n'est jamais affiché ni transmis ailleurs que dans ~/mes-liens/.env.auth (mode 600).
set -eu
umask 077
DIR="$HOME/mes-liens"
[ -e "$DIR/.env.auth" ] && { echo "Déjà configuré ($DIR/.env.auth existe). Supprime-le d'abord si tu veux recommencer."; exit 1; }

read -r -p "Adresse e-mail autorisée (ex. vous@gmail.com) : " EMAIL
case "$EMAIL" in *@*.*) ;; *) echo "Adresse invalide."; exit 1;; esac
read -r -p "ID client Google (se termine par .apps.googleusercontent.com) : " CID
case "$CID" in *.apps.googleusercontent.com) ;; *) echo "ID client invalide (doit se terminer par .apps.googleusercontent.com)."; exit 1;; esac
read -r -s -p "Secret client Google (saisie masquée) : " CSEC; echo
[ "${#CSEC}" -ge 20 ] || { echo "Secret trop court : arrêt."; exit 1; }

# Secret de cookie : 32 octets aléatoires générés ici (base64 « url-safe »)
COOKIE="$(openssl rand -base64 32 | tr -- '+/' '-_' | tr -d '\n')"

mkdir -p "$DIR/auth"
printf '%s\n' "$EMAIL" > "$DIR/auth/emails.txt"
{
  printf 'OAUTH2_PROXY_CLIENT_ID=%s\n' "$CID"
  printf 'OAUTH2_PROXY_CLIENT_SECRET=%s\n' "$CSEC"
  printf 'OAUTH2_PROXY_COOKIE_SECRET=%s\n' "$COOKIE"
} > "$DIR/.env.auth"
chmod 600 "$DIR/.env.auth" "$DIR/auth/emails.txt"

echo "Enregistré. Droits :"; stat -c '  %a %n' "$DIR/.env.auth" "$DIR/auth/emails.txt"
echo "Adresse autorisée : $EMAIL"
