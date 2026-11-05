import { describe, expect, it } from 'vitest';
import { Link } from './models';
import { HttpSyncApi, isoMs, suggestedServerUrl, validateServerUrl } from './sync-api';
import { SyncAuthError, SyncHttpError, SyncNetworkError } from './sync';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('validateServerUrl', () => {
  it('exige HTTPS sauf pour la machine locale, retire le slash final', () => {
    expect(validateServerUrl('https://liens.example.com/')).toBe('https://liens.example.com');
    expect(validateServerUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(() => validateServerUrl('http://liens.example.com')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('http://localhost.evil.com')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('pas une url')).toThrow();
  });
});

describe('suggestedServerUrl', () => {
  it('propose l’origine de la page en production (HTTPS), rien en local ni en HTTP', () => {
    expect(suggestedServerUrl({ protocol: 'https:', hostname: 'links.sn8w.com', origin: 'https://links.sn8w.com' })).toBe('https://links.sn8w.com');
    expect(suggestedServerUrl({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:4300' })).toBe('');
    expect(suggestedServerUrl({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost:4300' })).toBe('');
    expect(suggestedServerUrl({ protocol: 'http:', hostname: 'links.sn8w.com', origin: 'http://links.sn8w.com' })).toBe('');
  });
});

describe('isoMs', () => {
  it('ramène les dates du serveur (précisions variables) au format à la milliseconde, comparable en chaîne', () => {
    expect(isoMs('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00.000Z');
    expect(isoMs('2026-11-05T10:00:00.5Z')).toBe('2026-11-05T10:00:00.500Z');
    expect(isoMs('2026-11-05T10:00:00.123456Z')).toBe('2026-11-05T10:00:00.123Z');
    expect(() => isoMs('hier')).toThrow(SyncHttpError);
  });
});

describe('HttpSyncApi', () => {
  const link: Link = { id: 'a', url: 'https://x.io', title: 't', domain: 'x.io', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank: null, kind: 'link', parentId: null, createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:00:00.5Z', deletedAt: null };

  it('envoie le jeton en en-tête et normalise les dates reçues', async () => {
    let seen: Headers | undefined;
    const api = new HttpSyncApi('https://s.example', 'SECRET', async (_u, init) => {
      seen = new Headers(init?.headers);
      return json({ cursor: 3, head: 3, links: [link], events: [{ id: 'e', linkId: 'a', type: 'created', payload: {}, at: '2026-11-05T10:00:00Z' }] });
    });
    const r = await api.pull(0);
    expect(seen?.get('X-Api-Token')).toBe('SECRET');
    expect(r.links[0].updatedAt).toBe('2026-11-05T10:00:00.500Z');
    expect(r.events[0].at).toBe('2026-11-05T10:00:00.000Z');
  });

  it('jeton vide (accès automatique par le serveur) : aucun en-tête d’authentification n’est envoyé', async () => {
    let seen: Headers | undefined;
    const api = new HttpSyncApi('https://s.example', '', async (_u, init) => {
      seen = new Headers(init?.headers);
      return json({ cursor: 0, head: 0, links: [], events: [] });
    });
    await api.pull(0);
    expect(seen?.has('X-Api-Token')).toBe(false);
  });

  it('classe les erreurs : auth, réseau (coupure, 5xx, 429), refus d’un élément (4xx), capture absente', async () => {
    const mk = (f: typeof fetch) => new HttpSyncApi('https://s.example', 't', f);
    await expect(mk(async () => json({}, 401)).pull(0)).rejects.toBeInstanceOf(SyncAuthError);
    await expect(mk(async () => json({}, 403)).pull(0)).rejects.toBeInstanceOf(SyncAuthError);
    await expect(mk(async () => json({}, 503)).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => json({}, 429)).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => { throw new TypeError('Failed to fetch'); }).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => json({}, 400)).pushLinks([link])).rejects.toBeInstanceOf(SyncHttpError);
    expect(await mk(async () => json({}, 404)).getScreenshot('x')).toBeNull();
  });

  it('refuse de se construire avec une URL http non locale (le jeton ne doit pas circuler en clair)', () => {
    expect(() => new HttpSyncApi('http://liens.example.com', 't')).toThrow(/HTTPS/);
  });
});
