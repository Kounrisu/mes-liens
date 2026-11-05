import { describe, expect, it } from 'vitest';
import { HttpSyncApi, isoMs, validateServerUrl } from './sync-api';
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

describe('isoMs', () => {
  it('ramène les dates du serveur (précisions variables) au format à la milliseconde, comparable en chaîne', () => {
    expect(isoMs('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00.000Z');
    expect(isoMs('2026-11-05T10:00:00.5Z')).toBe('2026-11-05T10:00:00.500Z');
    expect(isoMs('2026-11-05T10:00:00.123456Z')).toBe('2026-11-05T10:00:00.123Z');
    expect(() => isoMs('hier')).toThrow(SyncHttpError);
  });
});

describe('HttpSyncApi', () => {
  const link = { id: 'a', url: 'https://x.io', title: 't', domain: 'x.io', tags: [], note: '', screenshotId: null, createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:00:00.5Z', deletedAt: null };

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

  it('classe les erreurs : auth, réseau (coupure, 5xx, 429), refus d’un élément (4xx), capture absente', async () => {
    const mk = (f: typeof fetch) => new HttpSyncApi('https://s.example', 't', f);
    await expect(mk(async () => json({}, 401)).pull(0)).rejects.toBeInstanceOf(SyncAuthError);
    await expect(mk(async () => json({}, 403)).pull(0)).rejects.toBeInstanceOf(SyncAuthError);
    await expect(mk(async () => json({}, 503)).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => json({}, 429)).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => { throw new TypeError('Failed to fetch'); }).pull(0)).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(mk(async () => json({}, 400)).putLink(link)).rejects.toBeInstanceOf(SyncHttpError);
    expect(await mk(async () => json({}, 404)).getScreenshot('x')).toBeNull();
  });

  it('refuse de se construire avec une URL http non locale (le jeton ne doit pas circuler en clair)', () => {
    expect(() => new HttpSyncApi('http://liens.example.com', 't')).toThrow(/HTTPS/);
  });
});
