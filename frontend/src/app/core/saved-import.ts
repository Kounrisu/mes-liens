import { zipSync, strToU8 } from 'fflate';
import { LinkStore } from './link-store';
import { planZipImport, ZIP_FORMAT, ZIP_VERSION, ZipLink } from './zip-backup';
import { libraryOf, validateLibrary } from './library';
import { detectSource, isYoutube, normalizeCategory } from './catalog';
import { domainOf, normalizeUrl } from './link-utils';
import { playlistUrl } from './youtube-playlists';
import { courseSuggestion } from './course-classification';
import { Link } from './models';

export interface SavedItem {
  url: string;
  title?: string;
  description?: string;
  creator?: string;
  publishedAt?: string;
  category?: string;
  playlists?: string[];
  collections?: string[];
}
/** Identity only for deduplication; existing bookmark URLs and timestamps are never rewritten. */
export function savedKey(raw: string): string {
  const u = new URL(raw);
  if (isYoutube(raw)) {
    const video =
      u.hostname === 'youtu.be'
        ? u.pathname.slice(1)
        : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    if (video && /^[\w-]{11}$/.test(video)) return 'youtube:video:' + video;
    if (playlistUrl(raw)) return 'youtube:' + playlistUrl(raw);
  }
  if (/(^|\.)(x\.com|twitter\.com)$/.test(u.hostname)) {
    const id = u.pathname.match(/\/status\/(\d+)/)?.[1];
    if (id) return 'x:' + id;
  }
  if (/(^|\.)facebook\.com$/.test(u.hostname)) {
    const id = u.searchParams.get('v') || u.pathname.match(/^\/(?:reel|watch)\/(\d+)/)?.[1];
    if (id) return 'facebook:video:' + id;
  }
  if (/(^|\.)instagram\.com$/.test(u.hostname)) {
    const id = u.pathname.match(/\/(?:p|reel|reels)\/([\w-]+)/)?.[1];
    if (id) return 'instagram:' + id;
  }
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^fbclid$|^gclid$|^__cft__|^__tn__$/.test(k)) u.searchParams.delete(k);
  return u.href;
}
export function readSavedItems(text: string): SavedItem[] {
  if (text.length > 10_000_000) throw new Error('Fichier trop volumineux (10 Mo maximum).');
  const raw: unknown = JSON.parse(text);
  const items = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || !items.length || items.length > 5000)
    throw new Error('Le fichier doit contenir entre 1 et 5000 liens.');
  return items.map((item, i) => {
    const bad = () => {
      throw new Error(`Lien ${i + 1} : données invalides.`);
    };
    if (!item || typeof item !== 'object' || typeof item.url !== 'string') return bad();
    const url = normalizeUrl(item.url);
    if (!url || url.length > 4096 || new URL(url).username || new URL(url).password) return bad();
    for (const [field, max] of [
      ['title', 1000],
      ['description', 10000],
      ['creator', 300],
      ['publishedAt', 10],
      ['category', 200],
    ] as const)
      if (
        item[field] !== undefined &&
        (typeof item[field] !== 'string' || item[field].length > max)
      )
        return bad();
    const metadata = validateLibrary({
      description: item.description,
      creator: item.creator,
      publishedAt: item.publishedAt,
      playlists: item.playlists,
      collections: item.collections,
    });
    return {
      url,
      title: item.title,
      category: item.category,
      description: metadata.description,
      creator: metadata.creator,
      publishedAt: metadata.publishedAt,
      playlists: metadata.playlists,
      collections: metadata.collections,
    };
  });
}
export async function planSavedImport(store: LinkStore, items: SavedItem[], category = '') {
  const existing = await store.listLinks({ includeDeleted: true });
  const byKey = new Map<string, Link>();
  for (const l of existing) {
    const key = savedKey(l.url);
    // A tombstone prevents a subsequent import from silently recreating a removed save.
    if (!byKey.has(key) || l.deletedAt) byKey.set(key, l);
  }
  const drafts = new Map<string, ZipLink>();
  let skippedDeleted = 0;
  for (const item of items) {
    const key = savedKey(item.url);
    const before = byKey.get(key);
    if (before?.deletedAt) {
      skippedDeleted++;
      continue;
    }
    const draft = drafts.get(key);
    const old = libraryOf(draft ?? before ?? {});
    const playlists = [
      ...new Set(
        [...old.playlists, ...(item.playlists ?? []), playlistUrl(item.url)].filter(Boolean),
      ),
    ];
    const collections = [...new Set([...old.collections, ...(item.collections ?? [])])];
    const known = detectSource(item.url);
    const library = validateLibrary({
      ...old,
      resourceType:
        old.resourceType !== 'other'
          ? old.resourceType
          : isYoutube(item.url)
            ? 'video'
            : ['X', 'Facebook', 'Instagram'].includes(known?.source ?? '')
              ? 'post'
              : known?.category === 'formation'
                ? 'course'
                : 'other',
      description: old.description || item.description || '',
      creator: old.creator || item.creator || '',
      publishedAt: old.publishedAt || item.publishedAt || '',
      playlists,
      collections,
    });
    const next: ZipLink = {
      ...(before ? { id: before.id } : {}),
      url: before?.url ?? item.url,
      title: before?.title ?? draft?.title ?? item.title ?? domainOf(item.url),
      source: before?.source || known?.source || '',
      category:
        before?.category || normalizeCategory(category || item.category || known?.category || ''),
      library,
    };
    if (!before && !category && !item.category) {
      const suggested = courseSuggestion({
        url: next.url,
        title: next.title ?? '',
        category: next.category ?? '',
        library,
        tags: [],
        kind: 'link',
        deletedAt: null,
      });
      if (suggested) {
        next.category = suggested;
        library.resourceType = 'course';
      }
    }
    drafts.set(key, next);
  }
  const bytes = zipSync({
    'links.json': strToU8(
      JSON.stringify({ format: ZIP_FORMAT, version: ZIP_VERSION, links: [...drafts.values()] }),
    ),
  });
  return { plan: await planZipImport(store, bytes), skippedDeleted, unique: drafts.size };
}
