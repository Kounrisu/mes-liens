import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { ImportError, exportAll, exportToJson, importFromJson } from './backup';
import { LinkStore } from './link-store';
import { Link, LinkEvent } from './models';

const link = (id: string, over: Partial<Link> = {}): Link => ({
  id,
  url: `https://example.com/${id}`,
  title: `Titre ${id}`,
  domain: 'example.com',
  tags: ['angular', 'veille'],
  note: 'à relire',
  screenshotId: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deletedAt: null,
  ...over,
});

const event = (id: string, linkId: string, at: string): LinkEvent => ({
  id,
  linkId,
  type: 'created',
  payload: { url: 'https://example.com' },
  at,
});

let store: LinkStore;
let n = 0;

beforeEach(async () => {
  store = await LinkStore.open(`test-db-${n++}`);
});
afterEach(() => store.close());

describe('LinkStore', () => {
  it('écrit et relit un lien à l’identique', async () => {
    const l = link('a');
    await store.putLink(l);
    expect(await store.getLink('a')).toEqual(l);
  });

  it('liste du plus récent au plus ancien et masque les tombstones', async () => {
    await store.putLink(link('old', { createdAt: '2026-10-01T00:00:00.000Z' }));
    await store.putLink(link('new', { createdAt: '2026-11-02T00:00:00.000Z' }));
    await store.putLink(link('gone', { createdAt: '2026-11-03T00:00:00.000Z', deletedAt: '2026-11-04T00:00:00.000Z' }));
    expect((await store.listLinks()).map((l) => l.id)).toEqual(['new', 'old']);
    expect((await store.listLinks({ includeDeleted: true })).map((l) => l.id)).toEqual(['gone', 'new', 'old']);
  });

  it('la suppression logique pose le tombstone, avance updatedAt et garde l’enregistrement', async () => {
    await store.putLink(link('a'));
    expect(await store.softDeleteLink('a', '2026-11-05T00:00:00.000Z')).toBe(true);
    const l = await store.getLink('a');
    expect(l?.deletedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(l?.updatedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(await store.softDeleteLink('a', '2026-11-06T00:00:00.000Z')).toBe(false);
    expect(await store.softDeleteLink('absent', '2026-11-06T00:00:00.000Z')).toBe(false);
  });

  it('le journal est en ajout seul : un id existant est refusé', async () => {
    await store.addEvent(event('e1', 'a', '2026-11-01T00:00:00.000Z'));
    await expect(store.addEvent({ ...event('e1', 'a', '2026-11-02T00:00:00.000Z'), type: 'revisited' })).rejects.toThrow();
    expect((await store.listEvents())[0].type).toBe('created');
  });

  it('listEvents filtre par lien et trie chronologiquement', async () => {
    await store.addEvent(event('e2', 'a', '2026-11-02T00:00:00.000Z'));
    await store.addEvent(event('e1', 'a', '2026-11-01T00:00:00.000Z'));
    await store.addEvent(event('e3', 'b', '2026-11-03T00:00:00.000Z'));
    expect((await store.listEvents('a')).map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('migration de la base', () => {
  it('les données écrites avant la synchro (base v2) sont marquées à pousser à l’ouverture', async () => {
    const name = `migr-${n++}`;
    // base v2 telle que l'écrivait la phase 3 : stores links / events / screenshots, sans dirty ni meta
    const v2 = await openDB(name, 2, {
      upgrade(db) {
        const l = db.createObjectStore('links', { keyPath: 'id' });
        l.createIndex('by-updatedAt', 'updatedAt');
        l.createIndex('by-createdAt', 'createdAt');
        const e = db.createObjectStore('events', { keyPath: 'id' });
        e.createIndex('by-linkId', 'linkId');
        e.createIndex('by-at', 'at');
        db.createObjectStore('screenshots', { keyPath: 'id' });
      },
    });
    await v2.put('links', link('ancien'));
    await v2.put('events', event('e-ancien', 'ancien', '2026-11-01T10:00:00.000Z'));
    v2.close();

    const migrated = await LinkStore.open(name);
    expect((await migrated.listDirty()).map((d) => d.key).sort()).toEqual(['event:e-ancien', 'link:ancien']);
    expect((await migrated.getLink('ancien'))?.title).toBe('Titre ancien'); // données intactes
    migrated.close();
  });
});

describe('export / import', () => {
  const seed = async () => {
    await store.putLink(link('a', { tags: ['x', 'é ü'], note: 'multi\nligne "quotes"' }));
    await store.putLink(link('b', { deletedAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T00:00:00.000Z' }));
    await store.putLink(link('c', { screenshotId: 'shot-1' }));
    await store.addEvent(event('e1', 'a', '2026-11-01T10:00:00.000Z'));
  };

  it('critère phase 1 : écrire, exporter, vider, réimporter à l’identique (tombstones inclus)', async () => {
    await seed();
    const before = await exportAll(store, 'T');
    const json = await exportToJson(store, 'T');

    await store.clear();
    expect(await store.listLinks({ includeDeleted: true })).toHaveLength(0);

    await importFromJson(store, json);
    expect(await exportAll(store, 'T')).toEqual(before);
  });

  it('refuse un fichier invalide sans toucher à la base', async () => {
    await seed();
    const before = await exportAll(store, 'T');
    const bad = [
      'pas du json',
      JSON.stringify({ format: 'autre', version: 1, links: [], events: [] }),
      JSON.stringify({ ...before, version: 99 }),
      JSON.stringify({ ...before, links: [{ ...before.links[0], createdAt: 'hier' }] }),
      JSON.stringify({ ...before, links: [before.links[0], before.links[0]] }),
      JSON.stringify({ ...before, events: [{ ...before.events[0], type: 'inconnu' }] }),
    ];
    for (const b of bad) await expect(importFromJson(store, b)).rejects.toBeInstanceOf(ImportError);
    expect(await exportAll(store, 'T')).toEqual(before);
  });

  it('merge : le plus récent gagne, un tombstone plus récent supprime, un plus ancien est ignoré', async () => {
    await store.putLink(link('a', { title: 'local récent', updatedAt: '2026-11-03T00:00:00.000Z' }));
    await store.putLink(link('b', { title: 'local ancien', updatedAt: '2026-11-01T00:00:00.000Z' }));
    await store.putLink(link('c', { updatedAt: '2026-11-01T00:00:00.000Z' }));
    const incoming = JSON.stringify({
      format: 'mes-liens-export',
      version: 1,
      exportedAt: 'T',
      links: [
        link('a', { title: 'distant ancien', updatedAt: '2026-11-02T00:00:00.000Z' }),
        link('b', { title: 'distant récent', updatedAt: '2026-11-02T00:00:00.000Z' }),
        link('c', { updatedAt: '2026-11-02T00:00:00.000Z', deletedAt: '2026-11-02T00:00:00.000Z' }),
        link('d'),
      ],
      events: [event('e1', 'a', '2026-11-01T00:00:00.000Z')],
    });
    await importFromJson(store, incoming, 'merge');
    expect((await store.getLink('a'))?.title).toBe('local récent');
    expect((await store.getLink('b'))?.title).toBe('distant récent');
    expect((await store.getLink('c'))?.deletedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(await store.getLink('d')).toBeDefined();
    expect(await store.listEvents()).toHaveLength(1);
  });
});
