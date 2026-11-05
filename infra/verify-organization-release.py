"""Read-only checks of the deployed organization release; no user content or secrets printed."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path.home() / 'mes-liens'
command = 'wget -q -O - --header="X-Api-Token: $MESLIENS_TOKEN" --header="X-Forwarded-Proto: https" http://127.0.0.1:8080/api/links'
links = json.loads(subprocess.check_output(['docker', 'exec', 'mesliens-api', 'sh', '-c', command]))
assert all(isinstance(link.get('favorite'), bool) and isinstance(link.get('library'), dict) for link in links)
print('Active links:', len(links), '; favorite and learning fields valid on every link')
for name in ('index.html', 'ngsw.json'):
    staged = (root / 'releases/organization-v1/browser' / name).read_bytes()
    live = (root / 'web/dist' / name).read_bytes()
    assert hashlib.sha256(staged).digest() == hashlib.sha256(live).digest()
print('Live Angular entrypoint and service-worker manifest match the tested build')
for route in ('/library', '/api/links', '/api/insights'):
    status = subprocess.check_output(['curl', '-q', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://links.sn8w.com' + route], text=True)
    assert status == '401'
print('Page, links API and insights API require authentication')
