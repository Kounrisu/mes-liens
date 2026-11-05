#!/usr/bin/env bash
# Frontend-only release: the existing API and database format already support these changes.
set -euo pipefail
root="$HOME/mes-liens"
release="$root/releases/bilingual-v1"
test "$(realpath "$root")" = "$HOME/mes-liens"
test -s "$release/browser/index.html"
test -s "$release/browser/ngsw.json"
test ! -e "$release/deployed"
mkdir -p "$release/rollback"
sh "$root/backup.sh"
if [ ! -e "$release/rollback/web.tgz" ]; then
  tar czf "$release/rollback/web.tgz" -C "$root/web/dist" .
fi
rollback() {
  trap - ERR
  tar xzf "$release/rollback/web.tgz" -C "$root/web/dist"
  echo 'Frontend verification failed; restored the previous frontend.' >&2
  exit 1
}
trap rollback ERR
# Keep old hashed files for already-open installed PWAs.
cp -a "$release/browser/." "$root/web/dist/"
for route in / /sources /library /youtube /table; do
  docker exec mesliens-web wget -q -O /dev/null "http://127.0.0.1$route"
  test "$(curl -q -s -o /dev/null -w '%{http_code}' "https://links.sn8w.com$route")" = 401
done
test "$(curl -q -s -o /dev/null -w '%{http_code}' https://links.sn8w.com/api/links)" = 401
touch "$release/deployed"
trap - ERR
echo 'Sources and bilingual interface deployed; routes and password protection verified.'
