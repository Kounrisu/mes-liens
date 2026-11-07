import { isYoutube } from './catalog';
import { libraryOf } from './library';
import { Link } from './models';

export function playlistId(raw: string): string | null {
  if (!isYoutube(raw)) return null;
  const id = new URL(raw).searchParams.get('list');
  return id && /^[A-Za-z0-9_-]{2,150}$/.test(id) ? id : null;
}
export function playlistUrl(raw: string): string {
  const id = playlistId(raw);
  return id ? `https://www.youtube.com/playlist?list=${id}` : '';
}
export function youtubePlaylists(links: readonly Link[]) {
  const groups = new Map<string, { id: string; url: string; title: string; links: Link[] }>();
  for (const l of links) {
    if (l.deletedAt || libraryOf(l).archived || !isYoutube(l.url)) continue;
    const urls = [...new Set([playlistUrl(l.url), ...libraryOf(l).playlists].filter(Boolean))];
    for (const url of urls) {
      const id = playlistId(url);
      if (!id) continue;
      if (!groups.has(id)) groups.set(id, { id, url: playlistUrl(url), title: id, links: [] });
      const group = groups.get(id)!;
      if (new URL(l.url).pathname === '/playlist' && playlistId(l.url) === id)
        group.title = l.title;
      else group.links.push(l);
    }
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}
