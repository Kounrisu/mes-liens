import { Link } from './models';
import { libraryOf } from './library';

/**
 * Normalise une URL saisie. N'accepte que http(s) : un `javascript:` ou `data:` collé ne doit JAMAIS
 * finir dans un href (XSS). Retourne null si invalide.
 */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme =
    /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/\s]+:\d+(\/|$)/.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Étiquettes libres et à plat : séparées par virgule ou retour ligne, minuscules, sans doublon. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const part of input.split(/[,\n]/)) {
    const t = part.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 64);
    if (t) seen.add(t);
  }
  return [...seen].slice(0, 50);
}

export function tagCounts(links: Link[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of links) for (const t of l.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Tous les mots de la recherche doivent apparaître (titre, url, note, étiquettes) ; toutes les étiquettes choisies doivent être présentes. */
export function filterLinks(links: Link[], query: string, tags: readonly string[]): Link[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return links.filter((l) => {
    if (!tags.every((t) => l.tags.includes(t))) return false;
    if (!words.length) return true;
    const b = libraryOf(l);
    const hay = fold(
      `${l.title} ${l.url} ${l.note} ${l.tags.join(' ')} ${l.category} ${l.source} ${b.collections.join(' ')} ${b.objective} ${b.resumeAt} ${b.nextAction} ${b.learned} ${b.applyTo} ${b.description} ${b.creator}`,
    );
    return words.every((w) => hay.includes(w));
  });
}
