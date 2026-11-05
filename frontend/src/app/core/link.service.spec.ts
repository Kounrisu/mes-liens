import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkService } from './link.service';

const fields = (over: Partial<Parameters<LinkService['add']>[0]> = {}) => ({
  url: 'https://example.com/a', title: 'Titre', tags: ['a', 'b'], note: 'note', category: '', source: '', kind: 'link' as const, parentId: null as string | null, screenshot: null, ...over,
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

describe('LinkService — sites et liens rattachés', () => {
  const ultimate = () => svc.add(fields({ url: 'https://app.ultimatecourses.com/', title: 'Ultimate Courses', kind: 'site', category: 'formation' }));

  it('enregistre un site, puis des liens rattachés qui héritent de sa catégorie et de son nom', async () => {
    const site = await ultimate();
    expect([site.kind, site.parentId]).toEqual(['site', null]);
    const c = await svc.add(fields({ url: 'https://app.ultimatecourses.com/courses/angular', title: 'Angular', parentId: site.id }));
    expect([c.kind, c.parentId, c.category, c.source]).toEqual(['link', site.id, 'formation', 'Ultimate Courses']);
  });

  it('la saisie de l’utilisateur l’emporte sur l’héritage du site', async () => {
    const site = await ultimate();
    const c = await svc.add(fields({ parentId: site.id, category: 'utile', source: 'Autre nom' }));
    expect([c.category, c.source]).toEqual(['utile', 'Autre nom']);
  });

  it('refuse un parent inconnu, supprimé ou qui n’est pas un site, sans rien écrire', async () => {
    const plain = await svc.add(fields());
    const site = await ultimate();
    await svc.remove(site.id);
    const before = svc.count();
    for (const parentId of ['inconnu', plain.id, site.id]) await expect(svc.add(fields({ parentId }))).rejects.toThrow(/n'existe plus/);
    await expect(svc.add(fields({ kind: 'site', parentId: plain.id }))).rejects.toThrow(/autre site/);
    expect(svc.count()).toBe(before);
  });

  it('rattacher puis détacher un lien existant (update) ; un site ne devient pas lien ordinaire tant qu’il a des liens', async () => {
    const site = await ultimate();
    const c = await svc.add(fields());
    expect((await svc.update(c.id, { ...fields(), parentId: site.id })).parentId).toBe(site.id);
    await expect(svc.update(site.id, { ...fields({ url: 'https://app.ultimatecourses.com/' }), kind: 'link' })).rejects.toThrow(/liens rattachés/);
    expect((await svc.update(c.id, { ...fields(), parentId: null })).parentId).toBeNull();
    expect((await svc.update(site.id, { ...fields({ url: 'https://app.ultimatecourses.com/' }), kind: 'link' })).kind).toBe('link');
  });

  it('un lien ne peut pas être son propre parent', async () => {
    const site = await ultimate();
    await expect(svc.update(site.id, { ...fields({ url: 'https://app.ultimatecourses.com/' }), kind: 'link', parentId: site.id })).rejects.toThrow(/lui-même/);
  });
});

describe('LinkService — focus', () => {
  const rank = (id: string) => svc.find(id)?.focusRank;

  it('ajoute en dernière position, monte, descend, retire et referme les trous', async () => {
    const a = await svc.add(fields({ url: 'https://a.example/x' }));
    const b = await svc.add(fields({ url: 'https://b.example/x' }));
    const c = await svc.add(fields({ url: 'https://c.example/x' }));
    expect(rank(a.id)).toBeNull(); // un nouveau lien n'est pas dans le focus
    for (const l of [a, b, c]) await svc.addToFocus(l.id);
    expect([rank(a.id), rank(b.id), rank(c.id)]).toEqual([1, 2, 3]);

    await svc.moveInFocus(c.id, -1);
    expect([rank(a.id), rank(c.id), rank(b.id)]).toEqual([1, 2, 3]);
    await svc.moveInFocus(a.id, -1); // déjà en tête : sans effet
    expect(rank(a.id)).toBe(1);

    await svc.removeFromFocus(a.id);
    expect(rank(a.id)).toBeNull();
    expect([rank(c.id), rank(b.id)]).toEqual([1, 2]);
  });

  it('chaque lien modifié reçoit un updatedAt strictement plus récent et est marqué à pousser', async () => {
    const a = await svc.add(fields({ url: 'https://a.example/x' }));
    const b = await svc.add(fields({ url: 'https://b.example/x' }));
    await svc.addToFocus(a.id);
    await svc.addToFocus(b.id);
    const before = { a: svc.find(a.id)!.updatedAt, b: svc.find(b.id)!.updatedAt };
    await svc.moveInFocus(b.id, -1); // modifie a ET b dans la même milliseconde
    expect(svc.find(a.id)!.updatedAt > before.a).toBe(true);
    expect(svc.find(b.id)!.updatedAt > before.b).toBe(true);
    const dirty = (await svc.storage.listDirty()).map((d) => d.key);
    expect(dirty).toContain(`link:${a.id}`);
    expect(dirty).toContain(`link:${b.id}`);
  });

  it('modifier un lien (update) conserve son rang de focus', async () => {
    const a = await svc.add(fields());
    await svc.addToFocus(a.id);
    await svc.update(a.id, { ...fields(), title: 'Autre titre' });
    expect(rank(a.id)).toBe(1);
  });

  it('un lien supprimé quitte le focus affiché et laisse les autres numérotés proprement au prochain mouvement', async () => {
    const a = await svc.add(fields({ url: 'https://a.example/x' }));
    const b = await svc.add(fields({ url: 'https://b.example/x' }));
    await svc.addToFocus(a.id);
    await svc.addToFocus(b.id);
    await svc.remove(a.id);
    await svc.removeFromFocus(a.id); // lien supprimé : ignoré sans erreur
    await svc.moveInFocus(b.id, -1);
    expect(rank(b.id)).toBe(2); // rang brut inchangé…
    await svc.addToFocus(b.id); // …et déjà dans le focus : rien
    expect(rank(b.id)).toBe(2);
  });
});

describe('LinkService.update', () => {
  it('modifie tous les champs, avance updatedAt, garde id et createdAt', async () => {
    const l = await svc.add(fields());
    await new Promise((r) => setTimeout(r, 5));
    const u = await svc.update(l.id, { url: 'https://other.org/x', title: 'Nouveau', tags: ['b', 'c'], note: 'autre', category: 'Manga', source: 'MangaDex', kind: 'link', parentId: null });
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

describe('LinkService.removeMany', () => {
  it('supprime le lot en une fois, ignore doublons et inconnus, laisse les autres, marque à pousser', async () => {
    const a = await svc.add(fields({ url: 'https://e.org/a' }));
    const b = await svc.add(fields({ url: 'https://e.org/b' }));
    const c = await svc.add(fields({ url: 'https://e.org/c' }));
    const before = svc.localChanges();
    expect(await svc.removeMany([a.id, b.id, a.id, 'inconnu'])).toBe(2);
    expect(svc.localChanges()).toBe(before + 1); // une seule synchro déclenchée
    expect(svc.links().map((l) => l.id)).toEqual([c.id]);
    expect((await svc.storage.getLink(a.id))?.deletedAt).not.toBeNull(); // tombstone conservé
    expect((await svc.storage.listDirty()).map((d) => d.key)).toContain(`link:${b.id}`);
    expect(await svc.removeMany([a.id])).toBe(0); // déjà supprimé : rien, pas de synchro inutile
  });
});
