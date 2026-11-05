"""Safari (Bookmarks.html + ReadingList.html) -> fichier d'import mes-liens v1.
Usage: python3 -I tools/safari_to_import.py <dossier export Safari> <sortie.json> [export_existant.json|links.json ...]
Les liens déjà présents (même URL normalisée) dans les exports existants sont ignorés."""
import sys, os, re, json, uuid, datetime, zipfile
from urllib.parse import urlsplit
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netscape_parse import parse

EXCLUDE_FOLDERS = {'0-missions', 'kampf'}
BAD_PARAMS = re.compile(r'(token|password|apikey|api_key)=', re.I)
JOB = re.compile(r'job|emploi|indeed|welcometothejungle|linkedin\.com/jobs|apec|hellowork|malt', re.I)
TRAIN = ('udemy.com','frontendmasters.com','coursera.org','egghead.io','pluralsight.com','openclassrooms.com','ultimatecourses.com','scrimba.com','edx.org','udacity.com','academind.com','developer.mozilla.org','angular.dev','w3.org','a11yproject.com','web.dev')
ANIME = ('crunchyroll.com','anilist.co','myanimelist.net')
MANGA = ('mangadex.org',)
def norm(u):
    s = urlsplit(u.strip()); host = s.netloc.lower()
    return f"{s.scheme.lower()}://{host}{s.path.rstrip('/')}" + (f"?{s.query}" if s.query else '')
def skip(u, path):
    s = urlsplit(u)
    if s.scheme not in ('http', 'https') or not s.netloc: return True
    h = s.hostname or ''
    if h == 'localhost' or re.match(r'(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)', h) or h == '::1': return True
    if re.search(r'(^|\.)google\.[a-z.]+$', h) and s.path.startswith('/search'): return True
    if 'facebook.com' in h or 'fb.com' in h: return True
    if BAD_PARAMS.search(u): return True
    if any(p.lower() in EXCLUDE_FOLDERS for p in path): return True
    return len(u) > 2000
def classify(u, path):
    h = (urlsplit(u).hostname or '').lower(); p = ' '.join(path).lower(); full = u.lower()
    on = lambda ds: any(h == d or h.endswith('.' + d) for d in ds)
    if on(ANIME): return 'anime'
    if on(MANGA): return 'manga'
    if on(TRAIN): return 'formation'
    if JOB.search(h) or JOB.search(p) : return 'emploi'
    if on(('youtube.com','youtu.be')): return ''
    root = (path[1] if path and path[0] == 'Favourites' and len(path) > 1 else path[0] if path else '').lower()
    if re.search(r'japan|korea|langu', p): return 'formation' if 'langu' in p else 'autre'
    if re.search(r'web|code|access|react|angular|course|training|focus|frontend|formation', p): return 'formation'
    if re.search(r'manga|anime', p): return 'manga'
    if re.search(r'tool|outil|design|clothes', p): return 'utile'
    return 'autre'
def clean_tag(t): return re.sub(r'\s+', ' ', re.sub(r'^\d{6,8}_?', '', t)).strip().lower()[:64]
def existing_urls(files):
    seen = set()
    for f in files:
        data = zipfile.ZipFile(f).read('links.json') if f.endswith('.zip') else open(f, 'rb').read()
        d = json.loads(data); d = d['links'] if isinstance(d, dict) else d
        seen |= {norm(l['url']) for l in d if not l.get('deletedAt') and not l.get('deleted')}
    return seen
def main():
    src, out, *ex = sys.argv[1:]
    seen = existing_urls(ex); skipped_existing = 0
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    items = [(i, False) for i in parse(src + '/Bookmarks.html')] + [(i, True) for i in parse(src + '/ReadingList.html')]
    links, events, stats = [], [], {'exclus': 0, 'doublons': 0, 'deja_en_base': 0}
    for it, reading in items:
        u, path = it['url'].strip(), it['path']
        if skip(u, path): stats['exclus'] += 1; continue
        k = norm(u)
        if k in seen:
            stats['deja_en_base' if k in ex_set else 'doublons'] += 1; continue
        seen.add(k)
        host = (urlsplit(u).hostname or '').removeprefix('www.')
        tags = ['import-safari'] + (['liste-de-lecture'] if reading else [])
        tags += sorted({t for t in (clean_tag(x) for x in path) if t and t not in ('favourites', 'sort')})
        lid = str(uuid.uuid4())
        links.append({'id': lid, 'url': u, 'title': (it['title'] or host)[:300], 'domain': host, 'tags': tags[:20], 'note': '',
                      'screenshotId': None, 'category': classify(u, path), 'source': '', 'focusRank': None, 'kind': 'link',
                      'parentId': None, 'createdAt': now, 'updatedAt': now, 'deletedAt': None})
        events.append({'id': str(uuid.uuid4()), 'linkId': lid, 'type': 'created', 'payload': {'source': 'import-safari'}, 'at': now})
    json.dump({'format': 'mes-liens-export', 'version': 1, 'exportedAt': now, 'links': links, 'events': events}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(links), 'liens à ajouter;', stats); print(Counter(l['category'] or 'non classé' for l in links))
ex_set = set()
if __name__ == '__main__':
    ex_set = existing_urls(sys.argv[3:]); main()
