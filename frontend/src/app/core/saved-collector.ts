/** Self-contained by design: runs as a bookmarklet without cookies, API calls or third-party code. */
export function collectSaved(
  document: Document = window.document,
  location: Pick<Location, 'hostname' | 'pathname' | 'href'> = window.location,
): void {
  if (document.getElementById('mesliens-collector')) return;
  const host = location.hostname.replace(/^www\./, '');
  const youtube = host === 'youtube.com' || host.endsWith('.youtube.com');
  const instagram = host === 'instagram.com';
  const facebook = host === 'facebook.com' || host === 'm.facebook.com';
  const x = host === 'x.com' || host === 'twitter.com';
  const xBookmarks = x && (location.pathname.includes('/bookmarks') ||
    (location.pathname === '/i/history' && /bookmarks|signets/i.test(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? '')));
  if (!(
    (youtube && /\/playlist(?:$|s$)|\/feed\/playlists$/.test(location.pathname)) ||
    (instagram && location.pathname.includes('/saved/')) ||
    (facebook && location.pathname.startsWith('/saved')) ||
    xBookmarks
  )) {
    alert(
      'mes-liens : ouvre une playlist YouTube ou la page de tes éléments enregistrés avant de collecter.',
    );
    return;
  }
  const items = new Map<string, Record<string, unknown>>();
  const panel = document.createElement('aside');
  panel.id = 'mesliens-collector';
  panel.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#fff;color:#111;padding:16px;border:2px solid #2459c5;border-radius:12px;font:14px system-ui;max-width:340px;box-shadow:0 4px 20px #0004';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const help = document.createElement('p');
  help.textContent =
    'Fais défiler tes éléments. Seuls les liens chargés sont collectés. Exporte ensuite le fichier et importe-le dans mes-liens.';
  panel.append(status, help);
  const clean = (s: string | null | undefined, max = 10000) =>
    (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const scan = () => {
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (panel.contains(anchor)) continue;
      let u: URL;
      try {
        u = new URL(anchor.href);
      } catch {
        continue;
      }
      let url = '',
        title = clean(anchor.getAttribute('title') || anchor.textContent, 1000),
        description = '',
        creator = '',
        publishedAt = '';
      const playlists: string[] = [];
      const collections: string[] = [];
      const card = anchor.closest(
        'article, ytd-playlist-video-renderer, yt-lockup-view-model, ytd-grid-playlist-renderer, [role="listitem"]',
      );
      if (youtube && /(^|\.)youtube\.com$/.test(u.hostname)) {
        const video = u.searchParams.get('v'),
          list = u.searchParams.get('list');
        if (location.pathname === '/playlist' && video && /^[\w-]{11}$/.test(video)) {
          url = 'https://www.youtube.com/watch?v=' + video;
          const parent = new URL(location.href).searchParams.get('list');
          if (parent && /^[\w-]{2,150}$/.test(parent))
            playlists.push('https://www.youtube.com/playlist?list=' + parent);
          const name = clean(document.querySelector('h1')?.textContent, 100);
          if (name) collections.push(name);
          title = clean(card?.querySelector('#video-title, h3, h4')?.textContent || title, 1000);
          creator = clean(card?.querySelector('ytd-channel-name')?.textContent, 300);
        } else if (u.pathname === '/playlist' && list && /^[\w-]{2,150}$/.test(list)) {
          url = 'https://www.youtube.com/playlist?list=' + list;
          title = clean(card?.querySelector('h3, h4, #video-title')?.textContent || title, 1000);
          playlists.push(url);
        }
      } else if (x && /(^|\.)(x\.com|twitter\.com)$/.test(u.hostname)) {
        const match = u.pathname.match(/^\/([^/]+)\/status\/(\d+)$/);
        if (match) {
          url = 'https://x.com/' + match[1] + '/status/' + match[2];
          description = clean(card?.querySelector('[data-testid="tweetText"]')?.textContent);
          title = description.slice(0, 150);
          creator = '@' + match[1];
          publishedAt = card?.querySelector('time')?.getAttribute('datetime')?.slice(0, 10) ?? '';
        }
      } else if (instagram && /(^|\.)instagram\.com$/.test(u.hostname)) {
        const match = u.pathname.match(/\/(p|reel|reels)\/([\w-]+)\/?$/);
        if (match) {
          url = 'https://www.instagram.com/' + match[1] + '/' + match[2] + '/';
          description = clean(anchor.querySelector('img')?.alt);
          title = description.slice(0, 150);
        }
      } else if (facebook && /(^|\.)facebook\.com$/.test(u.hostname)) {
        const video = u.searchParams.get('v') || u.pathname.match(/^\/reel\/(\d+)/)?.[1];
        if (video && /^\d+$/.test(video)) url = 'https://www.facebook.com/reel/' + video + '/';
        else if (/\/posts\/[^/]+/.test(u.pathname)) url = u.origin + u.pathname;
        description = title;
      }
      if (!url) continue;
      if (!title || /^(image|view full playlist|voir la playlist|\d+:\d+|.*'s post)$/i.test(title))
        title = '';
      const previous = items.get(url);
      if (
        !previous ||
        previous['title'] === url ||
        title.length > String(previous['title'] ?? '').length
      )
        items.set(url, {
          url,
          title: title || url,
          description,
          creator,
          publishedAt,
          playlists,
          collections,
        });
    }
    status.textContent = items.size + ' lien(s) collecté(s) — capture des éléments chargés';
  };
  const timer = window.setInterval(scan, 1200);
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:10px;margin:4px;cursor:pointer';
    b.onclick = action;
    panel.append(b);
  };
  button('Exporter les liens', () => {
    scan();
    if (!items.size) {
      status.textContent = 'Aucun lien chargé. Fais défiler la page.';
      return;
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: 'mes-liens-saved',
            version: 1,
            coverage: 'loaded-items',
            capturedAt: new Date().toISOString(),
            items: [...items.values()],
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mes-liens-' + host + '-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
  button('Fermer', () => {
    clearInterval(timer);
    panel.remove();
  });
  document.body.append(panel);
  scan();
}
export function buildSavedCollector(): string {
  return `javascript:(${collectSaved.toString()})();void 0`;
}
