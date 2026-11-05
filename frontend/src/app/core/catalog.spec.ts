import { describe, expect, it } from 'vitest';
import { YOUTUBE_CATEGORIES, categoryCounts, detectSource, groupYoutube, isYoutube, normalizeCategory, sortLinks } from './catalog';
import { Link } from './models';

const mk = (id: string, over: Partial<Link>): Link => ({
  id, url: 'https://example.com', title: id, domain: '', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank: null,
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


describe('YouTube', () => {
  it('reconnaît les adresses YouTube et rien d’autre', () => {
    for (const u of ['https://www.youtube.com/watch?v=1', 'https://youtube.com/@x', 'https://m.youtube.com/x', 'https://music.youtube.com/x', 'https://youtu.be/abc']) expect(isYoutube(u), u).toBe(true);
    for (const u of ['https://notyoutube.com', 'https://youtube.com.evil.example/x', 'https://example.com/youtube.com', 'pas une url']) expect(isYoutube(u), u).toBe(false);
  });
  it('détecte la source YouTube sans imposer de catégorie', () => {
    expect(detectSource('https://youtu.be/abc')).toEqual({ source: 'YouTube', category: '' });
  });
  it('range les liens YouTube dans les 6 sections (toujours présentes), le reste dans « autres »', () => {
    const yt = (id: string, category: string) => mk(id, { url: `https://www.youtube.com/watch?v=${id}`, category });
    const g = groupYoutube([
      yt('1', 'music'), yt('2', 'korean bands'), yt('3', 'korean bands'), yt('4', ''), yt('5', 'cuisine'),
      mk('web', { url: 'https://example.com', category: 'music' }), // pas YouTube : exclu
    ]);
    expect(g.sections.map((s) => s.category)).toEqual([...YOUTUBE_CATEGORIES]);
    expect(Object.fromEntries(g.sections.map((s) => [s.category, s.links.length]))).toEqual({
      formation: 0, music: 1, 'korean bands': 2, 'korean learning': 0, 'japanese learning': 0, 'japanese bands': 0,
    });
    expect(g.others.map((l) => l.id)).toEqual(['4', '5']);
  });
});