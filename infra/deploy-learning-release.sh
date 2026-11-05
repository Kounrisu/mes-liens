#!/usr/bin/env bash
# Run on the existing VPS after staging the verified jar, compose file, frontend and worker image.
set -euo pipefail
root="$HOME/mes-liens"
release="$root/releases/learning-v1"
test "$(realpath "$root")" = "$HOME/mes-liens"
test -s "$release/mes-liens-api.jar"
test -s "$release/browser/index.html"
test -s "$release/docker-compose.prod.yml"
docker image inspect mesliens-previews:learning-v1 >/dev/null
test ! -e "$release/deployed"
mkdir -p "$release/rollback"
sh "$root/backup.sh"
if [ ! -e "$release/rollback/ready" ]; then # retries preserve the original rollback snapshot
cp "$root/api/mes-liens-api.jar" "$release/rollback/mes-liens-api.jar"
cp "$root/docker-compose.prod.yml" "$release/rollback/docker-compose.prod.yml"
tar czf "$release/rollback/web.tgz" -C "$root/web/dist" .
touch "$release/rollback/ready"
fi
rollback() {
  trap - ERR
  echo 'Deployment failed; restoring previous API and frontend.' >&2
  docker stop mesliens-previews >/dev/null 2>&1 || true
  cp "$release/rollback/mes-liens-api.jar" "$root/api/mes-liens-api.jar"
  cp "$release/rollback/docker-compose.prod.yml" "$root/docker-compose.prod.yml"
  tar xzf "$release/rollback/web.tgz" -C "$root/web/dist"
  (cd "$root" && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api)
  exit 1
}
trap rollback ERR
cp "$release/mes-liens-api.jar" "$root/api/mes-liens-api.jar"
cp "$release/docker-compose.prod.yml" "$root/docker-compose.prod.yml"
cd "$root"
MESLIENS_BLOCKED_IPS="$(hostname -I | tr ' ' ',')" docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api previews
ready=false
for attempt in $(seq 1 30); do
  if docker exec mesliens-api sh -c 'wget -q -O /dev/null --header="X-Api-Token: $MESLIENS_TOKEN" --header="X-Forwarded-Proto: https" http://127.0.0.1:8080/api/insights'; then ready=true; break; fi
  sleep 2
done
test "$ready" = true
# Preserve old hashed assets so an already-open PWA can finish using the previous version.
cp -a "$release/browser/." "$root/web/dist/"
docker exec mesliens-web wget -q -O /dev/null http://127.0.0.1/library
test "$(curl -s -o /dev/null -w '%{http_code}' https://links.sn8w.com/library)" = 401
test "$(curl -s -o /dev/null -w '%{http_code}' https://links.sn8w.com/api/insights)" = 401
touch "$release/deployed"
trap - ERR
echo 'Learning library deployed; API, route and authentication checks passed.'
