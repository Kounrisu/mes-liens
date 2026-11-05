#!/bin/bash
# Ajoute la clé d'accès aux requêtes /api du bloc links.sn8w.com (côté serveur) + X-Robots-Tag noindex.
# La clé est lue dans .env.prod et passée par l'environnement : jamais affichée, jamais dans la liste des processus.
set -eu
cd ~/proxy
grep -q 'header_up X-Api-Token' Caddyfile && { echo "DÉJÀ APPLIQUÉ : je m'arrête"; exit 1; }

B="Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
cp Caddyfile "$B" && echo "copie de sauvegarde : $B (ne contient pas la clé)"

export T="$(grep '^MESLIENS_TOKEN=' ~/mes-liens/.env.prod | cut -d= -f2)"
[ "${#T}" -eq 64 ] || { echo "clé introuvable ou de longueur inattendue : arrêt"; exit 1; }

# Réécriture limitée au bloc links.sn8w.com (le reste du fichier est recopié à l'identique)
awk '
  /^links\.sn8w\.com \{/ { inblock = 1 }
  inblock && /Referrer-Policy "no-referrer"/ { print; print "\t\tX-Robots-Tag \"noindex, nofollow\""; next }
  inblock && /reverse_proxy mesliens-api:8080/ {
    print "\t\treverse_proxy mesliens-api:8080 {"
    print "\t\t\theader_up X-Api-Token \"" ENVIRON["T"] "\""
    print "\t\t}"
    next
  }
  { print }
  inblock && /^}/ { inblock = 0 }
' "$B" > /tmp/Caddyfile.new

# Contrôles AVANT d'écrire : exactement 1 en-tête de clé et 1 noindex ajoutés, rien d'autre de modifié
[ "$(grep -c 'header_up X-Api-Token' /tmp/Caddyfile.new)" = 1 ] || { echo "contrôle échoué (clé)"; rm -f /tmp/Caddyfile.new; exit 1; }
[ "$(grep -c 'X-Robots-Tag' /tmp/Caddyfile.new)" = 1 ]          || { echo "contrôle échoué (noindex)"; rm -f /tmp/Caddyfile.new; exit 1; }
echo "lignes modifiées par rapport à la copie (la clé est masquée) :"
diff <(sed 's/X-Api-Token ".*"/X-Api-Token "***"/' /tmp/Caddyfile.new) "$B" | sed 's/^/  /' || true

# Écriture EN PLACE (même fichier, même inode : le conteneur Caddy le voit), droits restreints puisque la clé y figure
cat /tmp/Caddyfile.new > Caddyfile
rm -f /tmp/Caddyfile.new
chmod 600 Caddyfile
stat -c "droits du Caddyfile : %a %U" Caddyfile

if docker exec caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "configuration valide"
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo "RECHARGEMENT OK (sans coupure)"
else
  cat "$B" > Caddyfile
  echo "VALIDATION ÉCHOUÉE : Caddyfile restauré à l'identique, rien rechargé"
  exit 1
fi
