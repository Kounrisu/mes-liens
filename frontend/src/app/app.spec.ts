import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { App } from './app';
import { LinkService } from './core/link.service';
import { libraryOf } from './core/library';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('counts the same active links as Table and YouTube, excluding archives', async () => {
    indexedDB = new IDBFactory();
    const svc = TestBed.inject(LinkService);
    await svc.init();
    const fields = {
      url: 'https://youtu.be/example',
      title: 'Video',
      source: '',
      category: '',
      tags: [],
      note: '',
      kind: 'link' as const,
      parentId: null,
      screenshot: null,
    };
    await svc.add(fields);
    await svc.add({ ...fields, url: 'https://example.com' });
    await svc.add({ ...fields, library: { ...libraryOf({}), archived: true } });
    const app = TestBed.createComponent(App).componentInstance as any;
    expect(app.tableCount()).toBe(2);
    expect(app.youtubeCount()).toBe(1);
    await svc.remove(svc.links().find((l) => l.url === 'https://example.com')!.id);
    expect(app.tableCount()).toBe(1);
  });

  it('affiche le titre et la navigation (accueil, tableau)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('mes-liens');
    const nav = el.querySelector('nav')?.textContent ?? '';
    expect(nav).toContain('Tableau');
    expect(nav).toContain('formation'); // catégories par défaut proposées
  });
});
