#!/usr/bin/env bash
# Stage the tested jar and browser build in releases/organization-v1 first.
set -euo pipefail
root="$HOME/mes-liens"
release="$root/releases/organization-v1"
test "$(realpath "$root")" = "$HOME/mes-liens"
test -s "$release/mes-liens-api.jar"
test -s "$release/browser/index.html"
test ! -e "$release/deployed"
mkdir -p "$release/rollback"
sh "$root/backup.sh"
if [ ! -e "$release/rollback/ready" ]; then
  cp "$root/api/mes-liens-api.jar" "$release/rollback/mes-liens-api.jar"
  tar czf "$release/rollback/web.tgz" -C "$root/web/dist" .
  touch "$release/rollback/ready"
fi
rollback() {
  trap - ERR
  echo 'Deployment failed; restoring the previous API and frontend.' >&2
  cp "$release/rollback/mes-liens-api.jar" "$root/api/mes-liens-api.jar"
  tar xzf "$release/rollback/web.tgz" -C "$root/web/dist"
  # V7 only adds a defaulted column; retain it and all user data when reverting the app.
  (cd "$root" && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api)
  exit 1
}
trap rollback ERR
cp "$release/mes-liens-api.jar" "$root/api/mes-liens-api.jar"
cd "$root"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api
ready=false
for attempt in $(seq 1 30); do
  if docker exec mesliens-api sh -c 'wget -q -O /dev/null --header="X-Api-Token: $MESLIENS_TOKEN" --header="X-Forwarded-Proto: https" http://127.0.0.1:8080/api/links'; then ready=true; break; fi
  sleep 2
done
test "$ready" = true
cp -a "$release/browser/." "$root/web/dist/"
docker exec mesliens-web wget -q -O /dev/null http://127.0.0.1/library
for route in /library /api/links /api/insights; do
  test "$(curl -q -s -o /dev/null -w '%{http_code}' "https://links.sn8w.com$route")" = 401
done
touch "$release/deployed"
trap - ERR
echo 'Organization release deployed; API, route and password protection checks passed.'
