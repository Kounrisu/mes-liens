import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkService } from './link.service';

const fields = (over: Partial<Parameters<LinkService['add']>[0]> = {}) => ({
  url: 'https://example.com/a', title: 'Titre', tags: ['a', 'b'], note: 'note', category: '', source: '', screenshot: null, ...over,
});

let svc: LinkService;
beforeEach(async () => {
  indexedDB = new IDBFactory(); // base vierge pour chaque test
  // jsdom + fake-indexeddb : un Blob relu depuis la base n'est plus un vrai Blob (limite de l'environnement de test)
  URL.createObjectURL = () => 'blob:test';
  TestBed.resetTestingModule();
  svc = TestBed.inject(LinkService);
  await svc.init();
});

describe('LinkService.add', () => {
  it('déduit source et catégorie d’un site de formation connu', async () => {
    const l = await svc.add(fields({ url: 'https://www.udemy.com/course/angular' }));
    expect([l.source, l.category]).toEqual(['Udemy', 'formation']);
  });

  it('la saisie de l’utilisateur l’emporte sur la détection', async () => {
    const l = await svc.add(fields({ url: 'https://www.udemy.com/course/x', category: ' Utile ', source: 'Ma source' }));
    expect([l.source, l.category]).toEqual(['Ma source', 'utile']);
  });

  it('un site inconnu reste non classé ; le lien est marqué à pousser et l’événement created écrit', async () => {
    const l = await svc.add(fields());
    expect([l.source, l.category]).toEqual(['', '']);
    expect((await svc.storage.listDirty()).map((d) => d.key).sort()).toContain(`link:${l.id}`);
    expect((await svc.storage.listEvents(l.id)).map((e) => e.type)).toEqual(['created']);
  });
});

describe('LinkService.update', () => {
  it('modifie tous les champs, avance updatedAt, garde id et createdAt', async () => {
    const l = await svc.add(fields());
    await new Promise((r) => setTimeout(r, 5));
    const u = await svc.update(l.id, { url: 'https://other.org/x', title: 'Nouveau', tags: ['b', 'c'], note: 'autre', category: 'Manga', source: 'MangaDex' });
    expect(u).toMatchObject({ id: l.id, createdAt: l.createdAt, url: 'https://other.org/x', title: 'Nouveau', domain: 'other.org', tags: ['b', 'c'], note: 'autre', category: 'manga', source: 'MangaDex' });
    expect(Date.parse(u.updatedAt)).toBeGreaterThan(Date.parse(l.updatedAt));
    expect(svc.find(l.id)?.title).toBe('Nouveau'); // la liste affichée est à jour
  });

  it('consigne dans le journal les étiquettes ajoutées/retirées et la note modifiée (et rien de plus)', async () => {
    const l = await svc.add(fields());
    await svc.update(l.id, { ...fields(), tags: ['b', 'c'], note: 'note modifiée' });
    const events = (await svc.storage.listEvents(l.id)).filter((e) => e.type !== 'created');
    expect(events.map((e) => [e.type, e.payload['tag']]).sort()).toEqual([['note_edited', undefined], ['tagged', 'c'], ['untagged', 'a']]);
  });

  it('une modification sans changement d’étiquette ni de note n’écrit aucun événement', async () => {
    const l = await svc.add(fields());
    await svc.update(l.id, { ...fields(), title: 'Autre titre' });
    expect((await svc.storage.listEvents(l.id)).map((e) => e.type)).toEqual(['created']);
  });

  it('retirer la capture met screenshotId à null', async () => {
    const l = await svc.add(fields({ screenshot: new Blob(['x'], { type: 'image/png' }) }));
    expect(l.screenshotId).not.toBeNull();
    const u = await svc.update(l.id, fields(), 'remove');
    expect(u.screenshotId).toBeNull();
  });

  it('refuse de modifier un lien supprimé ou inconnu', async () => {
    const l = await svc.add(fields());
    await svc.remove(l.id);
    await expect(svc.update(l.id, fields())).rejects.toThrow(/introuvable/);
    await expect(svc.update('inconnu', fields())).rejects.toThrow(/introuvable/);
  });

  it('la suppression retire le lien de la liste mais conserve le tombstone', async () => {
    const l = await svc.add(fields());
    await svc.remove(l.id);
    expect(svc.find(l.id)).toBeUndefined();
    expect((await svc.storage.getLink(l.id))?.deletedAt).not.toBeNull();
  });
});
