import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkStore } from './link-store';
import { applyZipImport } from './zip-backup';
import { planSavedImport, readSavedItems, savedKey } from './saved-import';
import { libraryOf, validateLibrary } from './library';
import { courseSuggestion, planCourseClassification } from './course-classification';
import { youtubePlaylists } from './youtube-playlists';
import { detectSource } from './catalog';

let store: LinkStore;
beforeEach(async () => {
  indexedDB = new IDBFactory();
  store = await LinkStore.open();
});
const video = 'https://www.youtube.com/watch?v=abcdefghijk';
const playlist = 'https://www.youtube.com/playlist?list=PLtest123';
describe('manual saved imports', () => {
  it('merges videos from multiple playlists and re-imports without duplicates or metadata loss', async () => {
    const items = readSavedItems(
      JSON.stringify({
        items: [
          {
            url: video,
            title: 'Angular course',
            playlists: [playlist],
            description: 'Signals',
            creator: 'Teacher',
          },
          {
            url: 'https://youtu.be/abcdefghijk?t=10',
            title: 'Alternate',
            playlists: ['https://www.youtube.com/playlist?list=PLsecond'],
          },
        ],
      }),
    );
    const first = await planSavedImport(store, items);
    expect(first.plan.errors).toEqual([]);
    expect(first.plan.created).toHaveLength(1);
    expect(first.plan.created[0].link.category).toBe('formation / angular');
    await applyZipImport(store, first.plan, { deleteMissing: false });
    const l = (await store.listLinks())[0];
    expect(libraryOf(l).playlists).toHaveLength(2);
    expect(libraryOf(l).description).toBe('Signals');
    const repeat = await planSavedImport(store, items);
    expect(repeat.plan.created).toHaveLength(0);
    expect(repeat.plan.updated).toHaveLength(0);
    expect(repeat.plan.unchanged).toBe(1);
  });
  it('preserves notes, titles, tags and custom classification, fills only missing descriptions', async () => {
    const original = await planSavedImport(store, [{ url: video, title: 'My title' }]);
    await applyZipImport(store, original.plan, { deleteMissing: false });
    const l = (await store.listLinks())[0];
    await store.mutateLinks([l.id], (l) => ({
      ...l,
      note: 'Personal',
      category: 'my category',
      tags: ['keep'],
      library: { ...libraryOf(l), creator: 'My author' },
    }));
    const update = await planSavedImport(
      store,
      [
        {
          url: video,
          title: 'Changed',
          description: 'Missing description',
          creator: 'Other author',
        },
      ],
      'formation',
    );
    expect(update.plan.updated[0].link).toMatchObject({
      title: 'My title',
      note: 'Personal',
      tags: ['keep'],
      category: 'my category',
    });
    expect(update.plan.updated[0].link.library).toMatchObject({
      description: 'Missing description',
      creator: 'My author',
    });
  });
  it('never resurrects deleted saves and never deletes links absent from a partial capture', async () => {
    const first = await planSavedImport(store, [
      { url: video, title: 'Video' },
      { url: 'https://example.com', title: 'Keep' },
    ]);
    await applyZipImport(store, first.plan, { deleteMissing: false });
    const l = (await store.listLinks()).find((l) => l.url === video)!;
    await store.softDeleteLink(l.id, new Date().toISOString());
    const next = await planSavedImport(store, [{ url: video, title: 'Again' }]);
    expect(next.skippedDeleted).toBe(1);
    expect(next.plan.created).toEqual([]);
    await applyZipImport(store, next.plan, { deleteMissing: false });
    expect(await store.listLinks()).toHaveLength(1);
  });
  it('rejects stale previews and malicious imported values before writing', async () => {
    const start = await planSavedImport(store, [{ url: video, title: 'Original' }]);
    await applyZipImport(store, start.plan, { deleteMissing: false });
    const preview = await planSavedImport(store, [{ url: video, description: 'Imported' }]);
    const l = (await store.listLinks())[0];
    await store.mutateLinks([l.id], (l) => ({ ...l, note: 'Concurrent edit' }));
    await expect(applyZipImport(store, preview.plan, { deleteMissing: false })).rejects.toThrow(
      /changé/,
    );
    for (const item of [
      { url: 'javascript:alert(1)' },
      { url: 'https://user:secret@example.com' },
      { url: video, publishedAt: '2026-02-30' },
      { url: video, playlists: ['javascript:alert(1)'] },
    ])
      expect(() => readSavedItems(JSON.stringify([item]))).toThrow();
  });
  it('recognizes platform identities without conflating different posts', () => {
    expect(savedKey('https://twitter.com/a/status/123?s=1')).toBe(
      savedKey('https://x.com/i/status/123'),
    );
    expect(savedKey('https://www.facebook.com/watch/?v=123')).toBe(
      savedKey('https://www.facebook.com/reel/123/'),
    );
    expect(savedKey('https://instagram.com/a/p/abc/')).toBe(
      savedKey('https://instagram.com/p/abc/'),
    );
    expect(savedKey('https://x.com/a/status/124')).not.toBe(savedKey('https://x.com/a/status/123'));
  });
});
describe('courses and playlists', () => {
  it('classifies course topics precisely and retains custom subcategories', () => {
    const base = {
      url: 'https://master.dev/courses/test/',
      title: '',
      tags: [],
      category: '',
      kind: 'link' as const,
      deletedAt: null,
    };
    for (const [title, topic] of [
      ['JavaScript fundamentals', 'javascript'],
      ['Java fundamentals', 'java'],
      ['TypeScript', 'typescript'],
      ['Angular with TypeScript', 'angular'],
      ['Full-stack Angular Java', 'fullstack'],
      ['Docker and Kubernetes', 'devops'],
      ['Security fundamentals', 'security'],
    ])
      expect(courseSuggestion({ ...base, title })).toBe('formation / ' + topic);
    expect(
      courseSuggestion({ ...base, category: 'formation / my subject', title: 'JavaScript' }),
    ).toBe('formation / my subject');
    expect(
      courseSuggestion({ ...base, url: 'https://news.example.com', title: 'JavaScript news' }),
    ).toBeNull();
    expect(courseSuggestion({ ...base, kind: 'site' })).toBeNull();
    expect(detectSource('https://master.dev.evil.test')).toBeNull();
    expect(detectSource('https://master.dev/courses/java')).toEqual({
      source: 'Master.dev',
      category: 'formation',
    });
  });
  it('groups playlist URLs with their videos and excludes deleted or archived records', async () => {
    const p = await planSavedImport(store, [
      { url: playlist, title: 'Angular' },
      { url: video, title: 'Video', playlists: [playlist] },
    ]);
    await applyZipImport(store, p.plan, { deleteMissing: false });
    const links = await store.listLinks();
    expect(youtubePlaylists(links)[0]).toMatchObject({
      title: 'Angular',
      links: [expect.objectContaining({ url: video })],
    });
    expect(
      youtubePlaylists(links.map((l) => ({ ...l, library: { ...libraryOf(l), archived: true } }))),
    ).toEqual([]);
    expect(planCourseClassification(links)).toBeInstanceOf(Array);
  });
  it('defaults legacy metadata and validates dates and bounded descriptions', () => {
    expect(libraryOf({})).toMatchObject({
      description: '',
      creator: '',
      publishedAt: '',
      playlists: [],
    });
    expect(() => validateLibrary({ publishedAt: '2026-02-30' })).toThrow();
    expect(() => validateLibrary({ creator: 'x'.repeat(301) })).toThrow();
  });
});
