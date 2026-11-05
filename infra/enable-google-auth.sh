#!/bin/bash
# À lancer SUR LE SERVEUR (après auth-setup.sh et le démarrage du conteneur mesliens-oauth).
# Remplace le bloc links.sn8w.com du Caddy partagé par la version AVEC connexion Google (infra/caddy-site-block.auth.txt).
# Garde-fous : préconditions, copie datée, contrôles AVANT écriture, écriture en place (même inode), validation, vérification
# en conditions réelles APRÈS rechargement, et restauration automatique de l'ancien bloc si quoi que ce soit échoue.
set -eu
TPL="$HOME/mes-liens/caddy-site-block.auth.txt"
cd ~/proxy

[ -f "$HOME/mes-liens/.env.auth" ] && [ -s "$HOME/mes-liens/auth/emails.txt" ] || { echo "Identifiants Google absents : lance d'abord auth-setup.sh"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx mesliens-oauth || { echo "Le conteneur mesliens-oauth ne tourne pas : arrêt"; exit 1; }
docker exec mesliens-web wget -q -O /dev/null http://mesliens-oauth:4180/ping || { echo "mesliens-oauth ne répond pas : arrêt"; exit 1; }
[ -f "$TPL" ] || { echo "$TPL introuvable"; exit 1; }
grep -q 'forward_auth mesliens-oauth' Caddyfile && { echo "DÉJÀ APPLIQUÉ : je m'arrête"; exit 1; }

B="Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
cp Caddyfile "$B" && chmod 600 "$B" && echo "copie de sauvegarde : $B"
export T="$(grep '^MESLIENS_TOKEN=' "$HOME/mes-liens/.env.prod" | cut -d= -f2)"
[ "${#T}" -eq 64 ] || { echo "clé de l'API introuvable ou de longueur inattendue : arrêt"; exit 1; }

# 1) retire l'ancien bloc links.sn8w.com ; 2) ajoute le nouveau en y plaçant la clé (via l'environnement, jamais affichée)
{
  awk '/^links\.sn8w\.com \{/ { skip = 1 } skip { if ($0 ~ /^\}/) skip = 0; next } { print }' "$B"
  echo
  awk '{ gsub(/<valeur de MESLIENS_TOKEN, lue sur le serveur>/, ENVIRON["T"]); print }' "$TPL"
} > /tmp/Caddyfile.new

n() { grep -c "$1" /tmp/Caddyfile.new || true; }
[ "$(n '^links\.sn8w\.com {')" = 1 ] && [ "$(n 'forward_auth mesliens-oauth')" = 2 ] && [ "$(n 'header_up X-Api-Token')" = 1 ] \
  || { echo "contrôles avant écriture échoués : rien n'a été modifié"; rm -f /tmp/Caddyfile.new; exit 1; }
echo "différences avec la copie (clé masquée) :"
diff <(sed 's/X-Api-Token ".*"/X-Api-Token "***"/' /tmp/Caddyfile.new) <(sed 's/X-Api-Token ".*"/X-Api-Token "***"/' "$B") | grep -c '^[<>]' | sed 's/^/  lignes différentes : /'

restore() { cat "$B" > Caddyfile; docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; echo "ANCIEN BLOC RESTAURÉ ($B)"; }

cat /tmp/Caddyfile.new > Caddyfile; rm -f /tmp/Caddyfile.new; chmod 600 Caddyfile
docker exec caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { echo "validation échouée"; restore; exit 1; }
docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { echo "rechargement échoué"; restore; exit 1; }
echo "rechargé (sans coupure)"

# Vérification réelle : sans cookie, la page doit renvoyer vers la connexion et l'API doit répondre 401
P="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 https://links.sn8w.com/)"
A="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://links.sn8w.com/api/sync)"
echo "page sans connexion : $P"; echo "API sans connexion   : $A"
case "$P" in 302*oauth2/sign_in*|303*oauth2/sign_in*) ;; *) echo "comportement inattendu de la page"; restore; exit 1;; esac
[ "$A" = 401 ] || { echo "l'API n'est pas protégée comme prévu"; restore; exit 1; }
echo "CONNEXION GOOGLE ACTIVE"
