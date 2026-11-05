import { UNCATEGORIZED } from './catalog';
import { Link } from './models';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const epoch = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
};

/**
 * Favoris au format « Netscape Bookmark » : celui que Chrome, Edge, Firefox et Safari savent importer.
 * Un dossier par catégorie (« non classé » pour les liens sans catégorie), les étiquettes dans TAGS, la note dans <DD>.
 * Les liens supprimés ne sont pas exportés.
 */
export function exportBookmarksHtml(links: readonly Link[], now = new Date().toISOString()): string {
  const byCat = new Map<string, Link[]>();
  for (const l of links) {
    if (l.deletedAt !== null) continue;
    const key = l.category || UNCATEGORIZED;
    byCat.set(key, [...(byCat.get(key) ?? []), l]);
  }
  const folders = [...byCat].sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b, 'fr', { sensitivity: 'base' })));

  const out: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- Fichier généré par mes-liens. Importable dans Chrome, Edge, Firefox et Safari. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${epoch(now)}">mes-liens</H3>`,
    '    <DL><p>',
  ];
  for (const [name, items] of folders) {
    out.push(`        <DT><H3 ADD_DATE="${epoch(now)}">${esc(name)}</H3>`, '        <DL><p>');
    for (const l of items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const tags = l.tags.length ? ` TAGS="${esc(l.tags.join(','))}"` : '';
      out.push(`            <DT><A HREF="${esc(l.url)}" ADD_DATE="${epoch(l.createdAt)}"${tags}>${esc(l.title || l.url)}</A>`);
      if (l.note) out.push(`            <DD>${esc(l.note)}`);
    }
    out.push('        </DL><p>');
  }
  out.push('    </DL><p>', '</DL><p>', '');
  return out.join('\n');
}
