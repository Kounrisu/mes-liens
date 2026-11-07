import { Link } from './models';

export const LEARNING_STATES = {
  later: 'À apprendre',
  active: 'En cours',
  done: 'Terminé',
} as const;
export const RESOURCE_TYPES = {
  other: 'Autre',
  course: 'Formation',
  article: 'Article',
  video: 'Vidéo',
  tool: 'Outil',
  post: 'Publication',
} as const;
export interface LibraryData {
  reviewed: boolean;
  archived: boolean;
  resourceType: keyof typeof RESOURCE_TYPES;
  collections: string[];
  learningStatus: keyof typeof LEARNING_STATES;
  objective: string;
  resumeAt: string;
  nextAction: string;
  learned: string;
  applyTo: string;
  reviewOn: string;
  description: string;
  creator: string;
  publishedAt: string;
  playlists: string[];
}
export function libraryOf(link: Pick<Link, 'library'>): LibraryData {
  return {
    reviewed: false,
    archived: false,
    resourceType: 'other',
    collections: [],
    learningStatus: 'later',
    objective: '',
    resumeAt: '',
    nextAction: '',
    learned: '',
    applyTo: '',
    reviewOn: '',
    ...link.library,
    description: link.library?.description ?? '',
    creator: link.library?.creator ?? '',
    publishedAt: link.library?.publishedAt ?? '',
    playlists: link.library?.playlists ?? [],
  };
}
export function validateLibrary(raw: unknown): LibraryData {
  if (raw === undefined || raw === null) return libraryOf({});
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Données de formation invalides.');
  const v = raw as Record<string, unknown>;
  const d = libraryOf({});
  for (const key of ['reviewed', 'archived'] as const) {
    if (v[key] !== undefined && typeof v[key] !== 'boolean')
      throw new Error(`${key} doit être un booléen.`);
    if (v[key] !== undefined) d[key] = v[key] as boolean;
  }
  for (const key of [
    'objective',
    'resumeAt',
    'nextAction',
    'learned',
    'applyTo',
    'reviewOn',
    'description',
    'creator',
    'publishedAt',
  ] as const) {
    if (v[key] !== undefined && (typeof v[key] !== 'string' || (v[key] as string).length > 10000))
      throw new Error(`${key} invalide (10000 caractères maximum).`);
    d[key] = (v[key] as string | undefined) ?? '';
  }
  if (
    d.reviewOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d.reviewOn) ||
      Number.isNaN(Date.parse(d.reviewOn)) ||
      new Date(d.reviewOn).toISOString().slice(0, 10) !== d.reviewOn)
  )
    throw new Error('Date de révision invalide.');
  if (v['resourceType'] !== undefined) {
    if (!Object.hasOwn(RESOURCE_TYPES, String(v['resourceType'])))
      throw new Error('Type de ressource invalide.');
    d.resourceType = v['resourceType'] as LibraryData['resourceType'];
  }
  if (d.creator.length > 300) throw new Error('Créateur trop long (300 caractères maximum).');
  if (
    d.publishedAt &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d.publishedAt) ||
      !Number.isFinite(Date.parse(d.publishedAt)) ||
      new Date(d.publishedAt).toISOString().slice(0, 10) !== d.publishedAt)
  )
    throw new Error('Date de publication invalide.');
  if (v['playlists'] !== undefined) {
    if (
      !Array.isArray(v['playlists']) ||
      v['playlists'].length > 100 ||
      v['playlists'].some(
        (p) =>
          typeof p !== 'string' ||
          !/^https:\/\/www\.youtube\.com\/playlist\?list=[A-Za-z0-9_-]{2,150}$/.test(p),
      )
    )
      throw new Error('Adresses de playlists YouTube invalides.');
    d.playlists = [...new Set(v['playlists'] as string[])];
  }
  if (v['learningStatus'] !== undefined) {
    if (!Object.hasOwn(LEARNING_STATES, String(v['learningStatus'])))
      throw new Error('Statut de formation invalide.');
    d.learningStatus = v['learningStatus'] as LibraryData['learningStatus'];
  }
  if (v['collections'] !== undefined) {
    if (
      !Array.isArray(v['collections']) ||
      v['collections'].length > 30 ||
      v['collections'].some((x) => typeof x !== 'string' || x.length > 100)
    )
      throw new Error('Collections invalides.');
    d.collections = [...new Set(v['collections'].map((x: string) => x.trim()).filter(Boolean))];
  }
  return d;
}
/** Conservative: retain fragments and meaningful query parameters, including video timestamps. */
export function duplicateKey(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()])
      if (/^utm_/i.test(k) || ['fbclid', 'gclid'].includes(k.toLowerCase()))
        u.searchParams.delete(k);
    return u.href;
  } catch {
    return raw.trim();
  }
}
export function duplicatesOf(links: readonly Link[], url: string, except?: string): Link[] {
  const key = duplicateKey(url);
  return links.filter(
    (l) => l.id !== except && l.deletedAt === null && duplicateKey(l.url) === key,
  );
}
export function categoryWithin(category: string, parent: string): boolean {
  return category === parent || (!!parent && category.startsWith(parent + ' / '));
}
export function categoryPaths(links: readonly Link[]): string[] {
  return [
    ...new Set(
      links
        .flatMap((l) => l.category.split(' / ').map((_, i, a) => a.slice(0, i + 1).join(' / ')))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'fr'));
}
