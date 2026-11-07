import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSaved, buildSavedCollector } from './saved-collector';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('browser collector', () => {
  it('collects the X History bookmarks tab but refuses the Likes tab', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    document.body.innerHTML = '<button role="tab" aria-selected="true">Likes</button>';
    const location = { hostname: 'x.com', pathname: '/i/history', href: 'https://x.com/i/history' };
    collectSaved(document, location);
    expect(alert).toHaveBeenCalled();
    expect(document.getElementById('mesliens-collector')).toBeNull();
    document.body.innerHTML = '<button role="tab" aria-selected="true">Bookmarks</button><article><a href="https://x.com/example/status/123">Saved post</a><div data-testid="tweetText">Saved text</div></article>';
    collectSaved(document, location);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('1 lien');
  });
  it('captures playlist videos, deduplicates thumbnails, and keeps collecting newly loaded items without network calls', () => {
    document.body.innerHTML =
      '<h1>Angular</h1><ytd-playlist-video-renderer><a href="https://www.youtube.com/watch?v=abcdefghijk">1</a><a id="video-title" href="https://www.youtube.com/watch?v=abcdefghijk" title="Angular course">Angular course</a><ytd-channel-name>Teacher</ytd-channel-name></ytd-playlist-video-renderer>';
    const fetch = vi.spyOn(globalThis, 'fetch');
    collectSaved(document, {
      hostname: 'www.youtube.com',
      pathname: '/playlist',
      href: 'https://www.youtube.com/playlist?list=PL123',
    });
    expect(document.querySelector('[role="status"]')?.textContent).toContain('1 lien');
    const a = document.createElement('a');
    a.href = 'https://www.youtube.com/watch?v=12345678901';
    a.textContent = 'Second';
    document.body.append(a);
    vi.advanceTimersByTime(1300);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('2 lien');
    expect(fetch).not.toHaveBeenCalled();
    const close = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Fermer',
    )!;
    close.click();
    expect(document.getElementById('mesliens-collector')).toBeNull();
  });
  it('refuses home timelines and accepts only saved-page captures', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    collectSaved(document, { hostname: 'x.com', pathname: '/home', href: 'https://x.com/home' });
    expect(alert).toHaveBeenCalled();
    expect(document.getElementById('mesliens-collector')).toBeNull();
    expect(buildSavedCollector()).toMatch(/^javascript:/);
  });
  it('collects saved Facebook reels and Instagram posts without including profile and navigation links', () => {
    document.body.innerHTML =
      '<a href="https://www.facebook.com/watch/?ref=saved&v=123">A useful tutorial</a><a href="https://www.facebook.com/profile.php?id=456">Author</a><a href="https://www.facebook.com/reel/123/">Author\'s post</a>';
    collectSaved(document, {
      hostname: 'www.facebook.com',
      pathname: '/saved/',
      href: 'https://www.facebook.com/saved/',
    });
    expect(document.querySelector('[role="status"]')?.textContent).toContain('1 lien');
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Fermer')!
      .click();
    document.body.innerHTML =
      '<a href="https://www.instagram.com/p/abc/"><img alt="Tutorial"></a><a href="https://www.instagram.com/example/">Profile</a>';
    collectSaved(document, {
      hostname: 'www.instagram.com',
      pathname: '/example/saved/all-posts/',
      href: 'https://www.instagram.com/example/saved/all-posts/',
    });
    expect(document.querySelector('[role="status"]')?.textContent).toContain('1 lien');
  });
});
