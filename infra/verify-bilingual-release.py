"""Read-only production checks; print counts, never bookmark content or credentials."""
import hashlib
import json
import subprocess
import re
import sys
from pathlib import Path

root = Path.home() / 'mes-liens'
release_name = sys.argv[1] if len(sys.argv) > 1 else 'bilingual-v1'
assert re.fullmatch(r'[a-z][a-z0-9-]{0,63}', release_name)
staged = root / 'releases' / release_name / 'browser'
live = root / 'web/dist'
for source in staged.rglob('*'):
    if source.is_file():
        target = live / source.relative_to(staged)
        assert hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(target.read_bytes()).digest()
print('All deployed frontend files match the staged build')
command = 'wget -q -O - --header="X-Api-Token: $MESLIENS_TOKEN" --header="X-Forwarded-Proto: https" http://127.0.0.1:8080/api/links'
links = json.loads(subprocess.check_output(['docker', 'exec', 'mesliens-api', 'sh', '-c', command]))
names = {l['source'].strip().lower() for l in links if l['source'].strip()}
names.update(l['title'].strip().lower() for l in links if l['kind'] == 'site')
print('API readable:', len(links), 'active links;', len(names), 'source/site names available to the catalogue')
for route in ('/sources', '/library', '/table', '/youtube', '/api/links'):
    status = subprocess.check_output(['curl', '-q', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://links.sn8w.com' + route], text=True)
    assert status == '401'
print('All checked pages and the links API require authentication')
