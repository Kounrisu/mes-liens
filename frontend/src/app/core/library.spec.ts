import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { libraryOf, validateLibrary, duplicatesOf, categoryWithin, categoryPaths } from './library';
import { LinkService } from './link.service';
import { filterLinks } from './link-utils';
import { Link } from './models';
import { exportToJson, importFromJson } from './backup';
import { exportZip, planZipImport, applyZipImport } from './zip-backup';

let svc: LinkService;
const fields = {
  url: 'https://example.com/course',
  title: 'Cours',
  tags: ['web'],
  note: '',
  category: 'développement / angular',
  source: 'École',
  kind: 'link' as const,
  parentId: null,
  screenshot: null,
};
beforeEach(async () => {
  indexedDB = new IDBFactory();
  URL.createObjectURL = () => 'blob:test';
  TestBed.resetTestingModule();
  svc = TestBed.inject(LinkService);
  await svc.init();
});
describe('bibliothèque', () => {
  it('keeps auto-categorized new links in inbox and persists learning data through JSON and ZIP', async () => {
    const l = await svc.add({ ...fields, url: 'https://udemy.com/course/x', category: '' });
    expect(l.category).toBe('formation');
    expect(libraryOf(l).reviewed).toBe(false);
    await svc.classifyMany([l.id], {
      collection: 'Mon projet',
      library: {
        reviewed: true,
        learningStatus: 'active',
        resumeAt: '12:30',
        learned: 'Un signal suit ses dépendances',
      },
    });
    const expected = libraryOf(svc.find(l.id)!);
    const json = await exportToJson(svc.storage);
    await importFromJson(svc.storage, json, 'replace');
    expect(libraryOf((await svc.storage.getLink(l.id))!)).toEqual(expected);
    const plan = await planZipImport(svc.storage, await exportZip(svc.storage));
    expect(plan.errors).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });
  it('searches source, category, collections and personal knowledge without accents', async () => {
    const l = await svc.add({
      ...fields,
      library: {
        ...libraryOf({}),
        collections: ['Architecture'],
        learned: 'Dépendances réactives',
      },
    });
    for (const q of ['ecole', 'developpement angular', 'architecture', 'dependances reactives'])
      expect(filterLinks([l], q, [])).toHaveLength(1);
  });
  it('warns on duplicates while preserving meaningful fragments and query parameters', async () => {
    const l = await svc.add(fields);
    expect(duplicatesOf([l], l.url + '?utm_source=x')).toHaveLength(1);
    expect(duplicatesOf([l], l.url + '?lesson=2')).toHaveLength(0);
    expect(duplicatesOf([l], l.url + '#chapter2')).toHaveLength(0);
    expect(duplicatesOf([{ ...l, deletedAt: new Date().toISOString() }], l.url)).toHaveLength(0);
    expect(duplicatesOf([l], l.url, l.id)).toHaveLength(0);
  });
  it('classifies all selected links atomically and can restore archives', async () => {
    const a = await svc.add(fields);
    const b = await svc.add({ ...fields, url: 'https://example.org' });
    await svc.classifyMany([a.id, b.id, a.id], {
      category: 'Tech/Frontend',
      tags: ['web', 'typescript'],
      collection: 'Projet',
      library: { reviewed: true, archived: true },
    });
    for (const l of svc.links()) {
      expect(l.category).toBe('tech / frontend');
      expect(l.tags).toEqual(['web', 'typescript']);
      expect(libraryOf(l).archived).toBe(true);
    }
    await svc.classifyMany([a.id], { library: { archived: false } });
    expect(libraryOf(svc.find(a.id)!).archived).toBe(false);
    const before = await svc.exportJson();
    await expect(svc.classifyMany([a.id, b.id], { collection: 'x'.repeat(101) })).rejects.toThrow();
    const after = JSON.parse(await svc.exportJson()),
      prev = JSON.parse(before);
    expect(after.links).toEqual(prev.links);
  });
  it('renames a category subtree and merges tags without changing site parents', async () => {
    const l = await svc.add(fields);
    await svc.renameClassification('category', 'développement', 'tech');
    expect(svc.find(l.id)?.category).toBe('tech / angular');
    expect(svc.find(l.id)?.parentId).toBeNull();
    expect(categoryPaths(svc.links())).toEqual(['tech', 'tech / angular']);
    expect(categoryWithin('technical', 'tech')).toBe(false);
    await expect(svc.renameClassification('category', 'tech', 'tech / angular')).rejects.toThrow();
  });
  it('rolls back every link and dirty mark if a bulk mutation fails midway', async () => {
    const a = await svc.add(fields),
      b = await svc.add(fields);
    const before = await svc.storage.listDirty();
    await expect(
      svc.storage.mutateLinks([a.id, b.id], (l) => {
        if (l.id === b.id) throw new Error('failure');
        return { ...l, category: 'changed' };
      }),
    ).rejects.toThrow('failure');
    expect((await svc.storage.getLink(a.id))?.category).toBe(fields.category);
    expect(await svc.storage.listDirty()).toEqual(before);
  });
  it('rejects stale import previews without overwriting concurrent edits', async () => {
    const l = await svc.add(fields);
    const zip = await exportZip(svc.storage);
    const plan = await planZipImport(svc.storage, zip);
    plan.updated.push({ link: { ...l, title: 'Imported' }, before: l, fields: ['titre'] });
    await svc.classifyMany([l.id], { library: { reviewed: true } });
    await expect(applyZipImport(svc.storage, plan, { deleteMissing: false })).rejects.toThrow(
      /changé/,
    );
    expect((await svc.storage.getLink(l.id))?.title).toBe('Cours');
  });
  it('validates bounded learning data and real dates', () => {
    for (const raw of [
      { learningStatus: 'invalid' },
      { reviewed: 'yes' },
      { collections: ['x'.repeat(101)] },
      { reviewOn: '2026-02-30' },
      { resourceType: '__proto__' },
    ])
      expect(() => validateLibrary(raw)).toThrow();
  });
});
