import { describe, expect, it } from 'vitest';
import { domainOf, filterLinks, normalizeUrl, parseTags, tagCounts } from './link-utils';
import { Link } from './models';

const mk = (id: string, over: Partial<Link>): Link => ({
  id, url: 'https://example.com', title: '', domain: '', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank: null,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null, ...over,
});

describe('normalizeUrl', () => {
  it('ajoute https:// et accepte http(s)', () => {
    expect(normalizeUrl('angular.dev/guide')).toBe('https://angular.dev/guide');
    expect(normalizeUrl(' http://example.com ')).toBe('http://example.com/');
    expect(normalizeUrl('localhost:4200')).toBe('https://localhost:4200/');
  });
  it('refuse les schémas dangereux et les entrées invalides', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.com', '', '   ', 'pas une url']) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });
});

describe('domainOf / parseTags', () => {
  it('extrait le domaine sans www', () => expect(domainOf('https://www.angular.dev/x')).toBe('angular.dev'));
  it('étiquettes : minuscules, sans doublon, sans vide', () => {
    expect(parseTags('Angular, veille,, ANGULAR\n  Offre emploi ')).toEqual(['angular', 'veille', 'offre emploi']);
  });
});

describe('filterLinks', () => {
  const links = [
    mk('1', { title: 'Signals Angular', tags: ['angular', 'veille'], note: 'à lire' }),
    mk('2', { title: 'Offre développeur', tags: ['emploi'], url: 'https://jobs.example.com/été' }),
    mk('3', { title: 'Cours Spring', tags: ['java', 'veille'] }),
  ];
  it('recherche insensible à la casse et aux accents, tous les mots', () => {
    expect(filterLinks(links, 'ANGULAR signals', []).map((l) => l.id)).toEqual(['1']);
    expect(filterLinks(links, 'ete', []).map((l) => l.id)).toEqual(['2']);
    expect(filterLinks(links, 'developpeur java', [])).toEqual([]);
  });
  it('filtre par étiquettes (ET) combiné à la recherche', () => {
    expect(filterLinks(links, '', ['veille']).map((l) => l.id)).toEqual(['1', '3']);
    expect(filterLinks(links, '', ['veille', 'java']).map((l) => l.id)).toEqual(['3']);
    expect(filterLinks(links, 'spring', ['angular'])).toEqual([]);
  });
  it('compte les étiquettes', () => {
    expect(tagCounts(links)[0]).toEqual({ tag: 'veille', count: 2 });
  });
});
