import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LinkService } from '../core/link.service';
import { LinkViews } from './link-views';

beforeEach(async () => {
  indexedDB = new IDBFactory();
  localStorage.removeItem('mesliens.view');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  await TestBed.inject(LinkService).init();
});

describe('shared library views', () => {
  it('keeps search and source filters when switching cards, list and table', async () => {
    const svc = TestBed.inject(LinkService);
    const fields = {
      url: 'https://example.com/angular',
      title: 'Angular course',
      source: 'YouTube',
      category: 'formation / angular',
      tags: ['learn'],
      note: '',
      kind: 'link' as const,
      parentId: null,
      screenshot: null,
    };
    await svc.add(fields);
    await svc.add({
      ...fields,
      url: 'https://example.com/java',
      title: 'Java course',
      category: 'formation / java',
    });
    await svc.add({ ...fields, url: 'https://example.com/other', source: 'Udemy' });
    const f = TestBed.createComponent(LinkViews);
    f.componentRef.setInput('links', svc.activeLinks());
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const search = el.querySelector('input[type=search]') as HTMLInputElement;
    search.value = 'Angular';
    search.dispatchEvent(new Event('input'));
    const source = el.querySelector('select[aria-label="Filtrer par source"]') as HTMLSelectElement;
    source.value = 'YouTube';
    source.dispatchEvent(new Event('change'));
    await f.whenStable();
    for (const mode of ['Liste', 'Tableau', 'Cartes']) {
      const button = [...el.querySelectorAll('.view-switch button')].find(
        (b) => b.textContent?.trim() === mode,
      ) as HTMLButtonElement;
      button.click();
      await f.whenStable();
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('[role=status]')?.textContent).toContain('1 résultat');
      expect(el.textContent).toContain('Angular course');
      expect(el.textContent).not.toContain('Java course');
      expect(search.value).toBe('Angular');
    }
  });

  it('allows one parent view switch to control playlist sections', async () => {
    const f = TestBed.createComponent(LinkViews);
    f.componentRef.setInput('links', []);
    f.componentRef.setInput('showSwitch', false);
    f.componentRef.setInput('viewMode', 'list');
    await f.whenStable();
    expect(f.nativeElement.querySelector('.view-switch')).toBeNull();
    expect(f.nativeElement.querySelector('app-link-rows')).not.toBeNull();
    f.componentRef.setInput('viewMode', 'table');
    await f.whenStable();
    expect(f.nativeElement.querySelector('app-links-table')).not.toBeNull();
  });
});
