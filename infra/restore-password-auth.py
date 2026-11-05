"""Restore only the saved mes-liens password rule; never print credentials or hashes."""
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone

proxy = Path.home() / 'proxy'
config = proxy / 'Caddyfile'
site = re.compile(r'^links\.sn8w\.com\s*\{\n.*?^\}', re.M | re.S)
auth = re.compile(r'^[ \t]*basic_auth\s*\{\s*\n[^}]+\}', re.M)
current = config.read_text()
match = site.search(current)
if not match:
    raise SystemExit('Target site block not found; no changes.')
if auth.search(match.group()):
    raise SystemExit('Password rule already present; no changes.')
saved = None
for candidate in sorted(proxy.glob('Caddyfile*'), key=lambda p: p.stat().st_mtime, reverse=True):
    if candidate == config or not candidate.is_file():
        continue
    block = site.search(candidate.read_text())
    rule = auth.search(block.group()) if block else None
    if rule and re.search(r'\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', rule.group()):
        saved = rule.group().strip()
        break
if not saved:
    raise SystemExit('No saved password rule found; no changes.')
block = match.group()
block = block.replace('{\n', '{\n\t' + saved + '\n', 1)
# Strip Basic credentials from both upstreams, without altering the API token.
for upstream in ('mesliens-api:8080', 'mesliens-web:80'):
    opened = re.compile(r'(reverse_proxy\s+' + re.escape(upstream) + r'\s*\{)([^}]*)(\})', re.S)
    found = opened.search(block)
    if found and 'header_up -Authorization' not in found.group(2):
        block = opened.sub(lambda m: m.group(1) + '\n\t\t\theader_up -Authorization' + m.group(2) + m.group(3), block)
    elif not found:
        block = re.sub(r'reverse_proxy\s+' + re.escape(upstream) + r'[ \t]*\n', 'reverse_proxy ' + upstream + ' {\n\t\t\theader_up -Authorization\n\t\t}\n', block)
updated = current[:match.start()] + block + current[match.end():]
backup = proxy / ('Caddyfile.bak-library-auth-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
backup.write_text(current)
backup.chmod(0o600)
try:
    config.write_text(updated) # preserve the bind-mounted inode
    config.chmod(0o600)
    for action in ('validate', 'reload'):
        subprocess.run(['docker','exec','caddy','caddy',action,'--config','/etc/caddy/Caddyfile'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for path in ('/', '/api/links'):
        result = subprocess.check_output(['curl','-q','-s','-o','/dev/null','-w','%{http_code}','--max-time','15','https://links.sn8w.com'+path],text=True)
        if result != '401':
            raise RuntimeError('Access check failed')
except Exception:
    config.write_text(current)
    subprocess.run(['docker','exec','caddy','caddy','reload','--config','/etc/caddy/Caddyfile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    raise SystemExit('Restoration failed; previous config restored.')
print('Previous password protection restored. Page and API return 401 anonymously. Other site blocks unchanged.')
