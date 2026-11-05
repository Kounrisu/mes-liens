import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LinkService } from './link.service';
import { libraryOf } from './library';
import { sourcesOf } from './sources';
import { LinkForm } from '../shared/link-form';

let svc: LinkService;
const fields = {
  url: 'https://example.com/lesson',
  title: 'Lesson',
  source: 'Legacy source',
  category: '',
  tags: ['keep'],
  note: 'Keep my notes',
  kind: 'link' as const,
  parentId: null,
  screenshot: null,
};
beforeEach(async () => {
  indexedDB = new IDBFactory();
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  svc = TestBed.inject(LinkService);
  await svc.init();
});
describe('source catalogue', () => {
  it('shows text-only sources in the dropdown, including the edited link’s only source, and saves the selection', async () => {
    const legacy = await svc.add(fields);
    const f = TestBed.createComponent(LinkForm);
    f.componentRef.setInput('link', legacy);
    f.detectChanges();
    expect(f.nativeElement.querySelector('select').textContent).toContain('Legacy source');
    const c = f.componentInstance as any;
    c.setSource('New source name');
    f.detectChanges();
    expect(f.nativeElement.querySelector('select').textContent).toContain('New source name');
    c.pickSource('legacy source');
    expect(c.source()).toBe('Legacy source');
    expect(c.parentId()).toBe('');
    await c.submit(new Event('submit'));
    expect(svc.find(legacy.id)?.source).toBe('Legacy source');
  });
  it('creates and renames a source together with its attached and archived labels, then deletes only the site and clears attachments', async () => {
    await svc.saveSource(null, 'School', 'https://school.test');
    const site = svc.links()[0];
    const child = await svc.add({ ...fields, source: 'School', parentId: site.id });
    const archive = await svc.add({
      ...fields,
      source: 'school',
      library: { ...libraryOf({}), archived: true },
    });
    const other = await svc.add(fields);
    expect(sourcesOf(svc.links()).find((s) => s.key === 'school')?.links).toHaveLength(2);
    await svc.saveSource('school', 'New school', 'https://new.school.test');
    expect(svc.find(site.id)).toMatchObject({
      title: 'New school',
      url: 'https://new.school.test/',
      domain: 'new.school.test',
    });
    expect(svc.find(child.id)).toMatchObject({ source: 'New school', parentId: site.id });
    expect(svc.find(archive.id)?.source).toBe('New school');
    await svc.removeSource('new school');
    expect(svc.find(site.id)).toBeUndefined();
    expect((await svc.storage.getLink(site.id))?.deletedAt).not.toBeNull();
    for (const id of [child.id, archive.id])
      expect(svc.find(id)).toMatchObject({
        source: '',
        parentId: null,
        note: fields.note,
        tags: ['keep'],
        deletedAt: null,
      });
    expect(svc.find(other.id)?.source).toBe('Legacy source');
    const dirty = await svc.storage.listDirty();
    for (const id of [site.id, child.id, archive.id])
      expect(dirty.some((d) => d.id === id)).toBe(true);
  });
  it('renames text-only sources and rejects duplicate names or invalid addresses before changing data', async () => {
    const legacy = await svc.add(fields);
    await svc.saveSource('legacy source', 'Renamed', '');
    expect(svc.find(legacy.id)?.source).toBe('Renamed');
    const before = svc.links();
    await expect(svc.saveSource(null, ' renamed ', 'https://new.test')).rejects.toThrow(/existe/);
    await expect(svc.saveSource(null, 'Other', 'javascript:alert(1)')).rejects.toThrow(/invalide/);
    expect(svc.links()).toEqual(before);
  });
});
