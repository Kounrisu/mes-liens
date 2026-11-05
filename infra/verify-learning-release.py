"""Read-only release checks on the VPS. Never print link contents or credentials."""
import json
import subprocess
import hashlib
from pathlib import Path

def api(path):
    command = 'wget -q -O - --header="X-Api-Token: $MESLIENS_TOKEN" --header="X-Forwarded-Proto: https" http://127.0.0.1:8080' + path
    return subprocess.check_output(['docker','exec','mesliens-api','sh','-c',command])

links = json.loads(api('/api/links'))
assert all(isinstance(link.get('library'), dict) for link in links)
insights = json.loads(api('/api/insights'))
print('Active links:', len(links), '; all include learning data')
print('Preview queue:', len(insights), '; completed checks:', sum(bool(i['checkedAt']) for i in insights), '; screenshots:', sum(bool(i['screenshotId']) for i in insights))
shots = [i for i in insights if i['screenshotId']]
if shots:
    image = api('/api/screenshots/' + shots[0]['screenshotId'])
    assert image.startswith(b'\xff\xd8\xff') or image.startswith(b'\x89PNG')
    print('Automatic screenshot is readable:', len(image), 'bytes')
root = Path.home() / 'mes-liens'
for name in ('index.html','ngsw.json'):
    staged=(root/'releases/learning-v1/browser'/name).read_bytes()
    live=(root/'web/dist'/name).read_bytes()
    assert hashlib.sha256(staged).digest() == hashlib.sha256(live).digest()
print('Live Angular entrypoint and service-worker manifest match the tested build')
for path in ('/library', '/api/insights'):
    status=subprocess.check_output(['curl','-q','-s','-o','/dev/null','-w','%{http_code}','https://links.sn8w.com'+path],text=True)
    assert status == '401'
print('Page and API require authentication')
