import { Link } from './models';

/** Catégories proposées d'office ; l'utilisateur peut en saisir d'autres librement (elles apparaissent alors dans le menu). */
export const DEFAULT_CATEGORIES = ['formation', 'manga', 'anime', 'utile', 'emploi', 'veille', 'autre'] as const;

/** Libellé affiché pour une catégorie vide. */
export const UNCATEGORIZED = 'non classé';

interface KnownSource {
  /** Domaine (les sous-domaines correspondent aussi : « www.udemy.com », « app.udemy.com »). */
  domain: string;
  name: string;
  category: string;
}

/**
 * Sites reconnus automatiquement. Liste volontairement courte et vérifiable ; tout le reste se saisit à la main dans le champ « source ».
 * (« master.dev » demandé : je n'ai pas pu confirmer à quel site ce domaine correspond, il n'est donc pas listé.)
 */
export const KNOWN_SOURCES: readonly KnownSource[] = [
  { domain: 'udemy.com', name: 'Udemy', category: 'formation' },
  { domain: 'academind.com', name: 'Academind', category: 'formation' },
  { domain: 'frontendmasters.com', name: 'Frontend Masters', category: 'formation' },
  { domain: 'coursera.org', name: 'Coursera', category: 'formation' },
  { domain: 'egghead.io', name: 'egghead', category: 'formation' },
  { domain: 'pluralsight.com', name: 'Pluralsight', category: 'formation' },
  { domain: 'openclassrooms.com', name: 'OpenClassrooms', category: 'formation' },
  { domain: 'ultimatecourses.com', name: 'Ultimate Courses', category: 'formation' },
  { domain: 'scrimba.com', name: 'Scrimba', category: 'formation' },
  { domain: 'edx.org', name: 'edX', category: 'formation' },
  { domain: 'udacity.com', name: 'Udacity', category: 'formation' },
  { domain: 'crunchyroll.com', name: 'Crunchyroll', category: 'anime' },
  { domain: 'anilist.co', name: 'AniList', category: 'anime' },
  { domain: 'myanimelist.net', name: 'MyAnimeList', category: 'anime' },
  { domain: 'mangadex.org', name: 'MangaDex', category: 'manga' },
];

export function detectSource(url: string): { source: string; category: string } | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const hit = KNOWN_SOURCES.find((s) => host === s.domain || host.endsWith('.' + s.domain));
  return hit ? { source: hit.name, category: hit.category } : null;
}

/** Normalise une catégorie saisie : minuscules, espaces réduits, 64 caractères max. */
export function normalizeCategory(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 64);
}

/** Catégories par défaut + celles réellement utilisées, avec le nombre de liens (les vides à 0 restent proposées). */
export function categoryCounts(links: Link[]): { category: string; count: number }[] {
  const counts = new Map<string, number>(DEFAULT_CATEGORIES.map((c) => [c, 0]));
  for (const l of links) if (l.category) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  const rest = [...counts].map(([category, count]) => ({ category, count }));
  const defaults = DEFAULT_CATEGORIES as readonly string[];
  return [
    ...rest.filter((c) => defaults.includes(c.category)).sort((a, b) => defaults.indexOf(a.category) - defaults.indexOf(b.category)),
    ...rest.filter((c) => !defaults.includes(c.category)).sort((a, b) => a.category.localeCompare(b.category)),
  ];
}

export type SortKey = 'title' | 'source' | 'category' | 'domain' | 'createdAt' | 'updatedAt';
export type SortDir = 'asc' | 'desc';

/** Tri stable, insensible à la casse et aux accents ; les valeurs vides vont toujours en dernier. */
export function sortLinks(links: readonly Link[], key: SortKey, dir: SortDir): Link[] {
  const sign = dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  return [...links].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va === '' && vb !== '') return 1;
    if (vb === '' && va !== '') return -1;
    return sign * collator.compare(va, vb);
  });
}
