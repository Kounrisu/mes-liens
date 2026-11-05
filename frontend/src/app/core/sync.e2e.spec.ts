import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it } from 'vitest';
import { LinkStore } from './link-store';
import { Link } from './models';
import { SyncEngine } from './sync';
import { HttpSyncApi } from './sync-api';

/**
 * Test de bout en bout contre une VRAIE API (Spring Boot + PostgreSQL). Ignoré par défaut.
 * Lancer : SYNC_E2E_URL=http://localhost:8080 SYNC_E2E_TOKEN=<jeton> npx ng test --watch=false
 */
const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
const URL_ = env['SYNC_E2E_URL'];
const TOKEN = env['SYNC_E2E_TOKEN'] ?? '';

const mk = (title: string, min: number, over: Partial<Link> = {}): Link => ({
  id: crypto.randomUUID(), url: 'https://example.com/' + title, title, domain: 'example.com', tags: ['e2e'], note: '', screenshotId: null, category: '', source: '', focusRank: null,
  createdAt: new Date(Date.UTC(2026, 10, 5, 10, min)).toISOString(), updatedAt: new Date(Date.UTC(2026, 10, 5, 10, min)).toISOString(), deletedAt: null, ...over,
});

describe.skipIf(!URL_)('synchro de bout en bout (vraie API)', () => {
  const stores: LinkStore[] = [];
  afterAll(() => stores.forEach((s) => s.close()));
  const device = async (name: string) => {
    const store = await LinkStore.open(`e2e-${name}-${crypto.randomUUID()}`);
    stores.push(store);
    return { store, engine: new SyncEngine(store, new HttpSyncApi(URL_!, TOKEN)) };
  };

  it('lien créé « hors ligne » sur le téléphone → visible sur le portable ; modification ; suppression', async () => {
    const phone = await device('phone');
    const laptop = await device('laptop');
    await laptop.engine.sync(); // le portable a déjà son curseur

    const link = mk('créé hors ligne ' + Date.now(), 1); // date ancienne
    await phone.store.putLink(link);
    await phone.engine.sync();
    await laptop.engine.sync();
    expect((await laptop.store.getLink(link.id))?.title).toBe(link.title);

    // égalité de format de date : le serveur renvoie "…00Z", le client garde ".000Z"
    expect((await laptop.store.getLink(link.id))?.updatedAt).toBe(link.updatedAt);

    await laptop.store.putLink({ ...link, title: 'modifié sur le portable', updatedAt: '2026-11-05T10:30:00.000Z' });
    await laptop.engine.sync();
    await phone.engine.sync();
    expect((await phone.store.getLink(link.id))?.title).toBe('modifié sur le portable');

    await phone.store.softDeleteLink(link.id, '2026-11-05T10:45:00.000Z');
    await phone.engine.sync();
    await laptop.engine.sync();
    expect((await laptop.store.listLinks()).some((l) => l.id === link.id)).toBe(false);
    expect((await laptop.store.getLink(link.id))?.deletedAt).not.toBeNull();
  });
});
