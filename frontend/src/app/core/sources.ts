import { Link } from './models';

export const sourceKey = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase('fr');
export interface SourceEntry {
  key: string;
  name: string;
  sites: Link[];
  links: Link[];
}

/** The same catalogue powers the form and management page, including legacy text sources. */
export function sourcesOf(links: readonly Link[]): SourceEntry[] {
  const active = links.filter((l) => l.deletedAt === null);
  const groups = new Map<string, SourceEntry>();
  const entry = (name: string) => {
    const key = sourceKey(name);
    if (!groups.has(key)) groups.set(key, { key, name: name.trim(), sites: [], links: [] });
    return groups.get(key)!;
  };
  for (const l of active) if (l.kind === 'site') entry(l.title).sites.push(l);
  for (const l of active) if (l.source.trim()) entry(l.source);
  for (const group of groups.values()) {
    const siteIds = new Set(group.sites.map((s) => s.id));
    group.links = active.filter(
      (l) =>
        !siteIds.has(l.id) &&
        (sourceKey(l.source) === group.key || (l.parentId !== null && siteIds.has(l.parentId))),
    );
  }
  return [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );
}
