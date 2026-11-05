#!/bin/bash
# À lancer SUR LE SERVEUR. Installe (ou CHANGE) l'identifiant + mot de passe du site, dans le bloc links.sn8w.com du Caddy partagé.
#   usage :  printf '%s' 'le-mot-de-passe' | ssh <vps> 'bash ~/mes-liens/enable-basic-auth.sh <identifiant>'
# Le mot de passe arrive par l'ENTRÉE STANDARD (jamais en argument de commande, donc absent de la liste des processus et de l'historique),
# n'est écrit nulle part en clair (seul son hash bcrypt va dans le Caddyfile, en mode 600) et n'est jamais affiché.
# Garde-fous : copie datée, contrôles avant écriture, écriture en place, validation, vérification RÉELLE après rechargement
# (sans identifiants 401, mauvais mot de passe 401, bon mot de passe 200 sur la page et sur l'API), restauration automatique sinon.
set -eu
NAME="${1:-}"
[[ "$NAME" =~ ^[A-Za-z0-9._-]{2,32}$ ]] || { echo "usage : printf '%s' MOTDEPASSE | bash enable-basic-auth.sh IDENTIFIANT   (2-32 caractères : lettres, chiffres, . _ -)"; exit 1; }
IFS= read -r PW || true
[ "${#PW}" -ge 8 ] || { echo "mot de passe absent ou trop court (8 caractères minimum) : arrêt"; exit 1; }

TPL="$HOME/mes-liens/caddy-site-block.basic.txt"
[ -f "$TPL" ] || { echo "$TPL introuvable"; exit 1; }
cd ~/proxy
grep -q '^links\.sn8w\.com {' Caddyfile || { echo "bloc links.sn8w.com introuvable : arrêt"; exit 1; }

export T="$(grep '^MESLIENS_TOKEN=' "$HOME/mes-liens/.env.prod" | cut -d= -f2)"
[ "${#T}" -eq 64 ] || { echo "clé de l'API introuvable ou de longueur inattendue : arrêt"; exit 1; }

# Hash bcrypt (coût 11) calculé par Caddy lui-même ; le mot de passe passe par stdin
H="$(printf '%s\n' "$PW" | docker exec -i caddy sh -c 'read -r P; caddy hash-password --plaintext "$P" --bcrypt-cost 11' | tr -d '\r\n')"
[[ "$H" =~ ^\$2[aby]\$11\$.{53}$ ]] || { echo "hash inattendu : arrêt"; exit 1; }
export U="$NAME" H

B="Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
cp Caddyfile "$B" && chmod 600 "$B" && echo "copie de sauvegarde : $B"

{
  awk '/^links\.sn8w\.com \{/ { skip = 1 } skip { if ($0 ~ /^\}/) skip = 0; next } { print }' "$B"
  echo
  awk '/^#/ { print; next } { gsub(/<NOM>/, ENVIRON["U"]); gsub(/<HASH>/, ENVIRON["H"]); gsub(/<CLE>/, ENVIRON["T"]); print }' "$TPL"
} > /tmp/Caddyfile.new

n() { grep -c "$1" /tmp/Caddyfile.new || true; }
[ "$(n '^links\.sn8w\.com {')" = 1 ] && [ "$(n $'^	basic_auth {')" = 1 ] && [ "$(n 'header_up X-Api-Token')" = 1 ] && [ "$(n 'header_up -Authorization')" = 2 ] \
  || { echo "contrôles avant écriture échoués : rien n'a été modifié"; rm -f /tmp/Caddyfile.new; exit 1; }
echo "lignes différentes de la copie (secrets masqués) : $(diff <(sed -E 's/X-Api-Token ".*"/X-Api-Token "***"/; s/(basic_auth \{)/\1/; s#^(\t\t)[^ ]+ \$2[aby]\$[^ ]+#\1*** ***#' /tmp/Caddyfile.new) <(sed -E 's/X-Api-Token ".*"/X-Api-Token "***"/' "$B") | grep -c '^[<>]')"

restore() { cat "$B" > Caddyfile; docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; echo "ANCIEN BLOC RESTAURÉ ($B)"; }

cat /tmp/Caddyfile.new > Caddyfile; rm -f /tmp/Caddyfile.new; chmod 600 Caddyfile
docker exec caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { echo "validation échouée"; restore; exit 1; }
docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { echo "rechargement échoué"; restore; exit 1; }
echo "rechargé (sans coupure)"

# Vérification réelle. Les identifiants passent par un fichier de configuration curl lu sur stdin : jamais en argument.
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }
auth() { printf 'user = "%s:%s"\n' "$U" "$1" | curl -s -o /dev/null -w '%{http_code}' --max-time 15 -K - "$2"; }
A0="$(code https://links.sn8w.com/)"; A1="$(code https://links.sn8w.com/api/sync)"
B1="$(auth "mauvais-mot-de-passe-$RANDOM" https://links.sn8w.com/)"
C1="$(auth "$PW" https://links.sn8w.com/)"; C2="$(auth "$PW" 'https://links.sn8w.com/api/sync?since=9007199254740991')"
echo "sans identifiants : page $A0, API $A1 (401 attendus)"
echo "mauvais mot de passe : $B1 (401 attendu)"
echo "bon mot de passe : page $C1, API $C2 (200 attendus)"
{ [ "$A0" = 401 ] && [ "$A1" = 401 ] && [ "$B1" = 401 ] && [ "$C1" = 200 ] && [ "$C2" = 200 ]; } || { echo "comportement inattendu"; restore; exit 1; }
echo "MOT DE PASSE ACTIF pour l'identifiant « $U »"
