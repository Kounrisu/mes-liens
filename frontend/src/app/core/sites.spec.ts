import { describe, expect, it } from 'vitest';
import { Link } from './models';
import { checkHierarchy, childrenOf, findSiteForUrl, siteOf, sitesOf } from './sites';

const mk = (id: string, over: Partial<Link> = {}): Link => ({
  id, url: 'https://example.com', title: id, domain: '', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank: null,
  kind: 'link', parentId: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null, ...over,
});
const site = (id: string, url: string, over: Partial<Link> = {}) => mk(id, { kind: 'site', url, title: id, ...over });

describe('sitesOf / childrenOf / siteOf', () => {
  const links = [
    site('Udemy', 'https://www.udemy.com'),
    site('Ultimate', 'https://app.ultimatecourses.com/'),
    site('Mort', 'https://old.example', { deletedAt: '2026-11-02T00:00:00.000Z' }),
    mk('c1', { parentId: 'Ultimate', createdAt: '2026-11-01T00:00:00.000Z' }),
    mk('c2', { parentId: 'Ultimate', createdAt: '2026-11-03T00:00:00.000Z' }),
    mk('c3', { parentId: 'Ultimate', deletedAt: '2026-11-04T00:00:00.000Z' }),
    mk('orphan', { parentId: 'Mort' }),
    mk('lost', { parentId: 'inconnu' }),
    mk('plain'),
  ];
  it('liste les sites non supprimés, par titre', () => expect(sitesOf(links).map((s) => s.id)).toEqual(['Udemy', 'Ultimate']));
  it('liste les liens d’un site, récents d’abord, sans les supprimés', () => expect(childrenOf(links, 'Ultimate').map((l) => l.id)).toEqual(['c2', 'c1']));
  it('un site supprimé ou inconnu n’a pas de liens', () => {
    expect(childrenOf(links, 'Mort')).toEqual([]);
    expect(childrenOf(links, 'inconnu')).toEqual([]);
  });
  it('siteOf est tolérant : parent supprimé, inconnu ou qui n’est plus un site → undefined, jamais d’erreur', () => {
    expect(siteOf(links, links.find((l) => l.id === 'c1')!)?.id).toBe('Ultimate');
    for (const id of ['orphan', 'lost', 'plain']) expect(siteOf(links, links.find((l) => l.id === id)!)).toBeUndefined();
    expect(siteOf([mk('p'), mk('x', { parentId: 'p' })], mk('x', { parentId: 'p' }))).toBeUndefined(); // parent pas un site
  });
});

describe('findSiteForUrl', () => {
  const sites = [site('yt', 'https://www.youtube.com'), site('uc', 'https://app.ultimatecourses.com/'), site('uc-root', 'https://ultimatecourses.com')];
  it('retrouve le site par domaine, avec ou sans www, sous-domaines compris', () => {
    expect(findSiteForUrl(sites, 'https://youtube.com/watch?v=1')?.id).toBe('yt');
    expect(findSiteForUrl(sites, 'https://www.youtube.com/@x')?.id).toBe('yt');
    expect(findSiteForUrl(sites, 'https://m.youtube.com/x')?.id).toBe('yt');
  });
  it('choisit le plus précis quand plusieurs correspondent', () => {
    expect(findSiteForUrl(sites, 'https://app.ultimatecourses.com/courses/angular')?.id).toBe('uc');
    expect(findSiteForUrl(sites, 'https://ultimatecourses.com/blog')?.id).toBe('uc-root');
  });
  it('ne se laisse pas tromper par un domaine qui ressemble', () => {
    expect(findSiteForUrl(sites, 'https://notyoutube.com')).toBeUndefined();
    expect(findSiteForUrl(sites, 'https://youtube.com.evil.example/x')).toBeUndefined();
    expect(findSiteForUrl(sites, 'https://example.com/youtube.com')).toBeUndefined();
    expect(findSiteForUrl(sites, 'pas une url')).toBeUndefined();
    expect(findSiteForUrl(sites, null)).toBeUndefined();
  });
});

describe('checkHierarchy', () => {
  const links = [site('s', 'https://s.example'), site('s2', 'https://s2.example'), mk('c', { parentId: 's' }), site('gone', 'https://g.example', { deletedAt: '2026-11-02T00:00:00.000Z' }), mk('plain')];
  it('accepte un rattachement valide ou aucun rattachement', () => {
    expect(checkHierarchy(links, 'plain', 'link', 's')).toBeNull();
    expect(checkHierarchy(links, null, 'link', 's')).toBeNull();
    expect(checkHierarchy(links, 'plain', 'link', null)).toBeNull();
    expect(checkHierarchy(links, 's2', 'site', null)).toBeNull();
  });
  it('refuse : soi-même, un site rattaché à un site, un parent supprimé / inconnu / qui n’est pas un site', () => {
    expect(checkHierarchy(links, 'plain', 'link', 'plain')).toMatch(/lui-même/);
    expect(checkHierarchy(links, 's2', 'site', 's')).toMatch(/autre site/);
    expect(checkHierarchy(links, 'plain', 'link', 'gone')).toMatch(/n'existe plus/);
    expect(checkHierarchy(links, 'plain', 'link', 'inconnu')).toMatch(/n'existe plus/);
    expect(checkHierarchy(links, 'x', 'link', 'plain')).toMatch(/n'existe plus/); // « plain » n'est pas un site
  });
  it('refuse de transformer en lien ordinaire un site qui a des liens', () => {
    expect(checkHierarchy(links, 's', 'link', null)).toMatch(/liens rattachés/);
    expect(checkHierarchy(links, 's2', 'link', null)).toBeNull(); // sans liens : possible
  });
});
