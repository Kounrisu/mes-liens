import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LinkService } from '../core/link.service';
import { InsightsService } from '../core/insights.service';
import { SelectionToolbar } from './selection-toolbar';
import { LinkForm } from './link-form';

let svc: LinkService;
const fields = {
  url: 'https://example.com/course',
  title: 'Course',
  tags: ['keep'],
  note: '',
  category: 'old',
  source: '',
  kind: 'link' as const,
  parentId: null,
  screenshot: null,
};
beforeEach(async () => {
  indexedDB = new IDBFactory();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: InsightsService, useValue: { records: signal({}), recheck: vi.fn() } },
    ],
  });
  svc = TestBed.inject(LinkService);
  await svc.init();
});

describe('bulk organization', () => {
  it('updates all filtered results beyond the displayed page, retains selection for successive actions and prunes hidden links', async () => {
    const first = await svc.add(fields);
    const links = Array.from({ length: 125 }, (_, i) => ({
      ...first,
      id: crypto.randomUUID(),
      title: `Course ${i}`,
    }));
    for (const l of links) await svc.storage.putLink(l);
    await svc.reload();
    const f = TestBed.createComponent(SelectionToolbar);
    f.componentRef.setInput('links', links);
    f.componentRef.setInput('shown', links.slice(0, 100));
    f.detectChanges();
    const c = f.componentInstance;
    c.select(false);
    expect(c.picked()).toHaveLength(100);
    c.select(true);
    expect(c.picked()).toHaveLength(125);
    await c.apply('favorite');
    c.value.set('new');
    await c.apply('tags');
    c.value.set('Tech / Angular');
    await c.apply('category');
    expect(c.picked()).toHaveLength(125);
    for (const l of links) {
      expect(svc.find(l.id)).toMatchObject({
        favorite: true,
        tags: ['keep', 'new'],
        category: 'tech / angular',
        focusRank: null,
      });
    }
    expect(svc.find(first.id)?.favorite).toBe(false);
    f.componentRef.setInput('links', links.slice(0, 2));
    f.detectChanges();
    expect(c.picked()).toHaveLength(2);
    f.componentRef.setInput('links', links);
    f.detectChanges();
    expect(c.picked()).toHaveLength(2);
    c.value.set('keep');
    await c.apply('removeTags');
    await c.apply('clearCategory');
    await c.apply('unfavorite');
    expect(svc.find(links[0].id)).toMatchObject({ tags: ['new'], category: '', favorite: false });
    expect(svc.find(links[2].id)?.favorite).toBe(true);
  });
});

describe('inline site creation', () => {
  it('creates a source as a site, selects it immediately, reuses it and saves the child relation', async () => {
    const f = TestBed.createComponent(LinkForm);
    f.detectChanges();
    const c = f.componentInstance as any;
    c.setUrl('https://master.dev/lessons/one');
    c.setSource('master.dev');
    c.openSiteCreator();
    expect(c.siteUrl()).toBe('https://master.dev');
    await c.createSite();
    f.detectChanges();
    const site = svc.links().find((l) => l.kind === 'site')!;
    expect(c.parentId()).toBe(site.id);
    expect(c.source()).toBe('master.dev');
    expect(f.nativeElement.querySelector('select')?.textContent).toContain('master.dev');
    c.openSiteCreator();
    await c.createSite();
    expect(svc.links().filter((l) => l.kind === 'site')).toHaveLength(1);
    await c.submit(new Event('submit'));
    expect(svc.links().find((l) => l.kind === 'link')).toMatchObject({
      parentId: site.id,
      source: site.title,
    });
  });
  it('keeps manual source text during suggestions, but an explicit site choice updates source and URL changes remove stale suggestions', async () => {
    const a = await svc.add({ ...fields, kind: 'site', title: 'Alpha', url: 'https://alpha.test' });
    const b = await svc.add({ ...fields, kind: 'site', title: 'Beta', url: 'https://beta.test' });
    const f = TestBed.createComponent(LinkForm);
    f.detectChanges();
    const c = f.componentInstance as any;
    c.setUrl('https://alpha.test/course');
    f.detectChanges();
    expect(c.parentId()).toBe(a.id);
    expect(c.source()).toBe('Alpha');
    c.setUrl('https://beta.test/course');
    f.detectChanges();
    expect(c.parentId()).toBe(b.id);
    expect(c.source()).toBe('Beta');
    c.setUrl('https://unknown.test');
    f.detectChanges();
    expect(c.parentId()).toBe('');
    c.setSource('My source');
    c.setUrl('https://alpha.test/course');
    f.detectChanges();
    expect(c.source()).toBe('My source');
    c.pickParent(b.id);
    expect(c.source()).toBe('Beta');
  });
});
