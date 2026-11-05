import { describe, expect, it } from 'vitest';
import { categoryCounts, detectSource, normalizeCategory, sortLinks } from './catalog';
import { Link } from './models';

const mk = (id: string, over: Partial<Link>): Link => ({
  id, url: 'https://example.com', title: id, domain: '', tags: [], note: '', screenshotId: null, category: '', source: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null, ...over,
});

describe('detectSource', () => {
  it('reconnaît un site de formation, ses sous-domaines, et propose la catégorie', () => {
    expect(detectSource('https://www.udemy.com/course/x')).toEqual({ source: 'Udemy', category: 'formation' });
    expect(detectSource('https://app.frontendmasters.com/courses/')).toEqual({ source: 'Frontend Masters', category: 'formation' });
    expect(detectSource('https://mangadex.org/title/1')).toEqual({ source: 'MangaDex', category: 'manga' });
  });
  it('ne se laisse pas tromper par un domaine qui ressemble', () => {
    expect(detectSource('https://notudemy.com')).toBeNull();
    expect(detectSource('https://udemy.com.evil.example/x')).toBeNull();
    expect(detectSource('https://example.com/udemy.com')).toBeNull();
    expect(detectSource('pas une url')).toBeNull();
  });
});

describe('catégories', () => {
  it('normalise la saisie', () => expect(normalizeCategory('  Sport   Santé ')).toBe('sport santé'));
  it('liste les catégories par défaut (même à 0) puis celles ajoutées par l’utilisateur', () => {
    const counts = categoryCounts([mk('a', { category: 'manga' }), mk('b', { category: 'manga' }), mk('c', { category: 'cuisine' }), mk('d', {})]);
    expect(counts.slice(0, 3)).toEqual([{ category: 'formation', count: 0 }, { category: 'manga', count: 2 }, { category: 'anime', count: 0 }]);
    expect(counts.at(-1)).toEqual({ category: 'cuisine', count: 1 });
  });
});

describe('sortLinks', () => {
  const links = [mk('b', { title: 'Écureuil', source: 'Udemy' }), mk('a', { title: 'abeille', source: '' }), mk('c', { title: 'Zèbre', source: 'Academind' })];
  it('trie sans tenir compte de la casse ni des accents', () => {
    expect(sortLinks(links, 'title', 'asc').map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(sortLinks(links, 'title', 'desc').map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
  it('les valeurs vides restent en dernier dans les deux sens', () => {
    expect(sortLinks(links, 'source', 'asc').map((l) => l.id)).toEqual(['c', 'b', 'a']);
    expect(sortLinks(links, 'source', 'desc').map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });
  it('ne modifie pas le tableau d’origine', () => {
    const copy = [...links];
    sortLinks(links, 'title', 'desc');
    expect(links).toEqual(copy);
  });
});
