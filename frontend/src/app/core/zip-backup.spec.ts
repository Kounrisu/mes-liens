import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportBookmarksHtml } from './export-html';
import { LinkStore } from './link-store';
import { Link } from './models';
import { ZIP_FORMAT, applyZipImport, exportZip, planZipImport, sniffImage } from './zip-backup';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-05T12:00:00.000Z';

const link = (over: Partial<Link> = {}): Link => ({
  id: ID1, url: 'https://example.com/a', title: 'A', domain: 'example.com', tags: ['x'], note: '', screenshotId: null,
  category: 'formation', source: 'Udemy', focusRank: null, kind: 'link', parentId: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, ...over,
});

// PNG minimal valide pour l'œil de sniffImage (signature + remplissage).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);

const archive = (links: unknown[], extra: Record<string, Uint8Array> = {}, meta: Record<string, unknown> = {}) =>
  zipSync({ 'links.json': strToU8(JSON.stringify({ format: ZIP_FORMAT, version: 1, links, ...meta })), ...extra });

let store: LinkStore;
beforeEach(async () => {
  indexedDB = new IDBFactory();
  store = await LinkStore.open();
});

describe('exportBookmarksHtml', () => {
  it('un dossier par catégorie, échappement HTML, tags et note, liens supprimés exclus', () => {
    const html = exportBookmarksHtml([
      link({ title: 'A <b> & "c"', note: 'ligne <1>', tags: ['t1', 't2'] }),
      link({ id: ID2, url: 'https://e.org/?a=1&b=2', title: 'B', category: '' }),
      link({ id: ID3, title: 'supprimé', deletedAt: NOW }),
    ], NOW);
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<H3 ADD_DATE="1793880000">formation</H3>');
    expect(html).toContain('<H3 ADD_DATE="1793880000">non classé</H3>');
    expect(html).toContain('>A &lt;b&gt; &amp; &quot;c&quot;</A>');
    expect(html).toContain('TAGS="t1,t2"');
    expect(html).toContain('<DD>ligne &lt;1&gt;');
    expect(html).toContain('HREF="https://e.org/?a=1&amp;b=2"');
    expect(html).not.toContain('supprimé');
  });
});

describe('exportZip', () => {
  it('links.json, LISEZ-MOI.md et captures ; liens supprimés exclus ; capture sniffée par son contenu', async () => {
    const fake = {
      listLinks: async () => [link({ screenshotId: ID2 }), link({ id: ID3, url: 'https://e.org/z' })],
      getScreenshot: async () => new Blob([PNG], { type: 'application/octet-stream' }),
    } as unknown as LinkStore;
    const files = unzipSync(await exportZip(fake, NOW));
    expect(Object.keys(files).sort()).toEqual(['LISEZ-MOI.md', 'links.json', `screenshots/${ID2}.png`]);
    const json = JSON.parse(strFromU8(files['links.json']));
    expect(json).toMatchObject({ format: ZIP_FORMAT, version: 1, exportedAt: NOW });
    expect(json.links).toHaveLength(2);
    expect(json.links[0].screenshot).toBe(`screenshots/${ID2}.png`);
    expect(json.links[1].screenshot).toBeNull();
    expect(strFromU8(files['LISEZ-MOI.md'])).toContain('links.json');
  });

  it('aller-retour : exporter puis réimporter sans rien changer = tout inchangé', async () => {
    await store.putLink(link());
    await store.putLink(link({ id: ID2, url: 'https://e.org/b', title: 'B', tags: ['k', 'j'], note: 'n', kind: 'site', category: 'utile' }));
    await store.putLink(link({ id: ID3, url: 'https://e.org/c', title: 'C', parentId: ID2, focusRank: 2 }));
    const plan = await planZipImport(store, await exportZip(store, NOW), NOW);
    expect(plan.errors).toEqual([]);
    expect([plan.created.length, plan.updated.length, plan.deleted.length, plan.missing.length, plan.unchanged]).toEqual([0, 0, 0, 0, 3]);
  });
});

describe('planZipImport — lecture et validation', () => {
  it('refuse ce qui n’est pas un zip, sans links.json, ou d’un autre format/version', async () => {
    await expect(planZipImport(store, strToU8('pas un zip'))).rejects.toThrow(/ZIP/);
    await expect(planZipImport(store, zipSync({ 'autre.txt': strToU8('x') }))).rejects.toThrow(/links\.json/);
    await expect(planZipImport(store, zipSync({ 'links.json': strToU8('{oups') }))).rejects.toThrow(/JSON/);
    await expect(planZipImport(store, zipSync({ 'links.json': strToU8('{"format":"x","version":1,"links":[]}') }))).rejects.toThrow(/mes-liens/);
    await expect(planZipImport(store, archive([], {}, { version: 2 }))).rejects.toThrow(/Version/);
  });

  it('accepte links.json dans un dossier (archive refaite en zippant le dossier)', async () => {
    const z = zipSync({ 'export/links.json': strToU8(JSON.stringify({ format: ZIP_FORMAT, version: 1, links: [{ url: 'https://e.org/n' }] })) });
    const plan = await planZipImport(store, z, NOW);
    expect(plan.errors).toEqual([]);
    expect(plan.created).toHaveLength(1);
  });

  it('collecte TOUTES les erreurs, n’écrit rien, et applyZipImport refuse', async () => {
    const plan = await planZipImport(store, archive([
      { url: 'javascript:alert(1)' },
      { url: 'https://e.org/ok', tags: 'pas une liste' },
      { url: 'https://e.org/k', kind: 'folder' },
      { url: 'https://e.org/f', focusRank: 0 },
      { url: 'https://e.org/s', screenshot: 'screenshots/absente.png' },
      { url: 'https://e.org/t', title: 'x'.repeat(1001) },
    ]), NOW);
    expect(plan.errors).toHaveLength(6);
    expect(plan.errors[0]).toMatch(/Lien #1.*adresse invalide/);
    await expect(applyZipImport(store, plan, { deleteMissing: false })).rejects.toThrow(/rien n'a été importé/);
    expect(await store.listLinks()).toEqual([]);
  });

  it('refuse un identifiant en double et un chemin de capture « .. »', async () => {
    const plan = await planZipImport(store, archive([
      { id: ID1, url: 'https://e.org/1' },
      { id: ID1, url: 'https://e.org/2' },
      { url: 'https://e.org/3', screenshot: '../x.png' },
    ]), NOW);
    expect(plan.errors.some((e) => /en double/.test(e))).toBe(true);
    expect(plan.errors.some((e) => /interdit/.test(e))).toBe(true);
  });

  it('refuse une « image » qui n’en est pas une (extension trompeuse)', async () => {
    const plan = await planZipImport(store, archive([{ url: 'https://e.org/1', screenshot: 'screenshots/a.png' }], { 'screenshots/a.png': strToU8('<svg onload=alert(1)>') }), NOW);
    expect(plan.errors[0]).toMatch(/pas une image/);
  });

  it('refuse un rattachement vers un lien ordinaire ou inconnu', async () => {
    await store.putLink(link({ id: ID2, url: 'https://e.org/b' })); // lien ordinaire, pas un site
    const plan = await planZipImport(store, archive([{ url: 'https://e.org/n', parentId: ID2 }, { url: 'https://e.org/m', parentId: ID3 }]), NOW);
    expect(plan.errors).toHaveLength(2);
    expect(plan.errors[0]).toMatch(/site choisi/);
  });
});

describe('planZipImport + applyZipImport — modifications', () => {
  it('détecte création, modification (champs précis), suppression marquée, lien absent, inchangé', async () => {
    await store.putLink(link());
    await store.putLink(link({ id: ID2, url: 'https://e.org/b', title: 'B' }));
    await store.putLink(link({ id: ID3, url: 'https://e.org/c', title: 'C' }));
    await store.putLink(link({ id: '44444444-4444-4444-8444-444444444444', url: 'https://e.org/d', title: 'D' }));
    const plan = await planZipImport(store, archive([
      { id: ID1, url: 'https://example.com/a', title: 'A modifié', tags: ['x', 'nouveau'], category: ' Manga ' },
      { id: ID2, deleted: true },
      { id: ID3 }, // champs absents = inchangé
      { url: 'https://nouveau.org/x', title: 'Neuf', tags: ['Z', 'z'] },
    ]), NOW);
    expect(plan.errors).toEqual([]);
    expect(plan.updated.map((c) => c.fields)).toEqual([['titre', 'catégorie', 'étiquettes']]);
    expect(plan.created).toHaveLength(1);
    expect(plan.created[0].link.tags).toEqual(['z']);
    expect(plan.deleted.map((l) => l.id)).toEqual([ID2]);
    expect(plan.missing.map((l) => l.title)).toEqual(['D']);
    expect(plan.unchanged).toBe(1);
  });

  it('applique : updatedAt plus récent, événements écrits, marquage à pousser ; les « absents » ne sont supprimés que sur option', async () => {
    await store.putLink(link());
    await store.putLink(link({ id: ID2, url: 'https://e.org/b', title: 'B' }));
    const bytes = archive([{ id: ID1, url: 'https://example.com/a', title: 'A2', note: 'une note', tags: ['y'] }, { url: 'https://nouveau.org/x', title: 'Neuf' }]);
    const plan = await planZipImport(store, bytes, NOW);
    const r = await applyZipImport(store, plan, { deleteMissing: false }, NOW);
    expect(r).toEqual({ created: 1, updated: 1, deleted: 0 });
    const a = await store.getLink(ID1);
    expect(a).toMatchObject({ title: 'A2', note: 'une note', tags: ['y'] });
    expect(Date.parse(a!.updatedAt)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
    expect((await store.listEvents(ID1)).map((e) => e.type).sort()).toEqual(['note_edited', 'tagged', 'untagged']);
    expect((await store.getLink(ID2))?.deletedAt).toBeNull(); // absent de l'archive mais conservé
    const keys = (await store.listDirty()).map((d) => d.key);
    expect(keys).toContain(`link:${ID1}`);
    expect(await store.listLinks()).toHaveLength(3);

    // même archive, avec l'option : le lien absent est supprimé
    const plan2 = await planZipImport(store, bytes, NOW);
    expect(plan2.missing.map((l) => l.id)).toContain(ID2);
    const r2 = await applyZipImport(store, plan2, { deleteMissing: true }, NOW);
    expect(r2.deleted).toBe(plan2.missing.length);
    expect((await store.listLinks()).map((l) => l.id)).not.toContain(ID2);
  });

  it('un identifiant inventé (non UUID) crée un lien et peut servir de parentId', async () => {
    const plan = await planZipImport(store, archive([
      { id: 'site-udemy', url: 'https://udemy.com/', title: 'Udemy', kind: 'site' },
      { id: 'cours-1', url: 'https://udemy.com/c/1', title: 'Cours', parentId: 'site-udemy' },
    ]), NOW);
    expect(plan.errors).toEqual([]);
    await applyZipImport(store, plan, { deleteMissing: false }, NOW);
    const all = await store.listLinks();
    const site = all.find((l) => l.kind === 'site')!;
    expect(all.find((l) => l.title === 'Cours')?.parentId).toBe(site.id);
    expect(site.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ajoute une capture depuis l’archive (type vérifié sur les octets) et peut la retirer avec null', async () => {
    const plan = await planZipImport(store, archive([{ id: ID1, url: 'https://e.org/1', screenshot: 'screenshots/photo.png' }], { 'screenshots/photo.png': PNG }), NOW);
    expect(plan.errors).toEqual([]);
    expect(plan.created[0].screenshot?.mime).toBe('image/png');
    await applyZipImport(store, plan, { deleteMissing: false }, NOW);
    const l = await store.getLink(ID1);
    expect(l?.screenshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.hasScreenshot(l!.screenshotId!)).toBe(true);
    expect((await store.listEvents(ID1)).map((e) => e.type)).toContain('screenshot_added');

    const plan2 = await planZipImport(store, archive([{ id: ID1, screenshot: null }]), NOW);
    expect(plan2.updated[0].fields).toEqual(['capture']);
    await applyZipImport(store, plan2, { deleteMissing: false }, NOW);
    expect((await store.getLink(ID1))?.screenshotId).toBeNull();
  });

  it('une archive trop grosse une fois décompressée est refusée', async () => {
    const big = new Uint8Array(21 * 1024 * 1024); // > 20 Mo pour un seul fichier
    await expect(planZipImport(store, zipSync({ 'links.json': strToU8('{}'), 'screenshots/x.png': big }))).rejects.toThrow(/dépasse/);
  });
});

describe('sniffImage', () => {
  it('reconnaît png/jpeg/gif/webp d’après les octets, rejette le reste', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(strToU8('GIF89a....'))).toBe('image/gif');
    expect(sniffImage(strToU8('RIFF....WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(strToU8('<svg></svg>'))).toBeNull();
  });
});
