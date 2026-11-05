import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkService } from './link.service';
import { SyncService } from './sync.service';

const prod = { protocol: 'https:', hostname: 'links.example.com', origin: 'https://links.example.com' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let links: LinkService;
let sync: SyncService;
beforeEach(async () => {
  indexedDB = new IDBFactory();
  TestBed.resetTestingModule();
  links = TestBed.inject(LinkService);
  await links.init();
  sync = TestBed.inject(SyncService);
});

describe('SyncService — session expirée en accès automatique', () => {
  it('un 401 en mode automatique demande de se reconnecter (et non de ressaisir un jeton)', async () => {
    const f = vi.fn(async () => json({}, 200));
    await sync.tryGateway(prod, f as unknown as typeof fetch); // active le mode automatique
    expect(sync.gateway()).toBe(true);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 401));
    await sync.syncNow();
    spy.mockRestore();
    expect(sync.status()).toBe('auth-error');
    expect(sync.message()).toMatch(/session a expiré/);
    expect(sync.message()).not.toMatch(/jeton/i);
  });
});

describe('SyncService.tryGateway (accès automatique)', () => {
  it('le serveur répond sans jeton : l’appareil se connecte seul, sans jeton conservé', async () => {
    const f = vi.fn(async () => json({ cursor: 0, head: 5, links: [], events: [] }));
    expect(await sync.tryGateway(prod, f as unknown as typeof fetch)).toBe(true);
    expect(sync.gateway()).toBe(true);
    expect(sync.status()).toBe('idle');
    expect(sync.serverUrl()).toBe('https://links.example.com');
    expect(await links.storage.getMeta('sync.config')).toEqual({ serverUrl: 'https://links.example.com', token: '' });
    // la question posée est minuscule : aucune donnée n'est tirée pour ce simple test
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/api/sync?since=9007199254740991');
  });

  it('le serveur exige un jeton (401) : pas de connexion automatique, le guide manuel reste', async () => {
    const f = vi.fn(async () => json({ error: 'Unauthorized' }, 401));
    expect(await sync.tryGateway(prod, f as unknown as typeof fetch)).toBe(false);
    expect(sync.gateway()).toBe(false);
    expect(sync.status()).toBe('unconfigured');
    expect(await links.storage.getMeta('sync.config')).toBeUndefined();
  });

  it('serveur injoignable : pas de connexion, pas d’erreur affichée, le drapeau « recherche » est bien retombé', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await sync.tryGateway(prod, f as unknown as typeof fetch)).toBe(false);
    expect(sync.probing()).toBe(false);
    expect(sync.status()).toBe('unconfigured');
  });

  it('en développement local ou en HTTP : aucune requête n’est envoyée', async () => {
    const f = vi.fn();
    for (const loc of [
      { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:4300' },
      { protocol: 'http:', hostname: 'links.example.com', origin: 'http://links.example.com' },
    ]) {
      expect(await sync.tryGateway(loc, f as unknown as typeof fetch)).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });
});
